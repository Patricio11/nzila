// The zone as a process that listens: its districts, and as many channels of
// each as there are people to fill them.
//
// A plain WebSocket and our own protocol, with no room library on either end
// (D-3.6, as revised): a library's client cost the phone 52 KB of a 300 KB
// budget for things our own messages already say. A client opens
// `/<district room>` (optionally `?paragem=<id>`), and its first message is a
// Join carrying the protocol it speaks and a ticket: the seat the API
// reserved for it in one of this zone's channels (Task 3.2). It is answered
// with JoinAccepted and then snapshots, or with JoinRefused and a closed line.
//
// The zone says every few seconds, where the API can read it, that it is
// alive and who is in each channel; a zone that stops saying so is sent
// nobody. `GET /health` says the same to a person, with how long the steps
// are taking.
//
// A session token is taken in place of a ticket only where that is switched
// on (`sessions`): for the swarm, the tests and a developer with no API. A
// zone that players reach must have it off: a session should never leave the
// API's own address.

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { playerOfSession } from "@nzila/db";
import { ZONE_SAYS_EVERY_S, type Presence, type ZoneCard } from "@nzila/presence";
import { JOIN_REFUSAL, PROTOCOL_VERSION, ZONE_CLOSE, decodeClientMessage, encodeJoinRefused, negotiate, type JoinRefusalCode } from "@nzila/protocol";
import { type Sql } from "postgres";
import { WebSocketServer, type WebSocket } from "ws";
import { roomNameOf, type District } from "./district.ts";
import { ChannelRoom, type Line, type ZoneDeps } from "./room.ts";

/** A client that connects and does not say who it is within this long is let go. */
const JOIN_WITHIN_MS = 10_000;
/** No message of ours from a client is anywhere near this long: anything bigger is not read at all. */
const MESSAGE_AT_MOST_BYTES = 1024;
/** The line was closed because the zone is closing: the phone may come back in a moment. */
const GOING_AWAY = 1001;

export interface ZoneOptions {
  readonly sql: Sql;
  /** The districts this process runs, and for each whether a player's place in it is kept. */
  readonly districts: readonly { readonly district: District; readonly remember?: boolean }[];
  /** Where the zone announces itself, takes seats from, and notes places. Without it there is no matchmaker: only sessions. */
  readonly presence?: Presence;
  /** Where a phone reaches this zone (wss://…), as the API will hand it out; "" for "the game's own address, at /zone". */
  readonly address?: string;
  /** Whether a session token is taken in place of a ticket. Off unless said: see the top of this file. */
  readonly sessions?: boolean;
  /** How many people a channel holds (the tunable `channels.cap`). */
  readonly holds?: number;
  readonly log?: (line: string) => void;
}

export interface Zone {
  /** The name this process goes by in the presence: new each time it starts. */
  readonly id: string;
  /** The names a client asks for to be put in a channel of each district. */
  readonly roomNames: readonly string[];
  readonly port: number;
  close(): Promise<void>;
}

interface Running {
  readonly deps: ZoneDeps;
  readonly channels: ChannelRoom[];
}

export async function startZone(options: ZoneOptions, port: number): Promise<Zone> {
  const { sql, presence } = options;
  const id = `zone-${randomBytes(6).toString("hex")}`;
  const log = options.log ?? ((line: string) => console.error(line));
  const running = new Map<string, Running>();
  for (const { district, remember } of options.districts) {
    running.set(roomNameOf(district.id), {
      deps: { sql, district, ...(remember === undefined ? {} : { remember }), ...(presence ? { presence } : {}), ...(options.holds ? { holds: options.holds } : {}), ...(options.log ? { log: options.log } : {}) },
      channels: [],
    });
  }
  let closing = false;

  /**
   * The channel someone is put in: the one their seat names (opened if it is not open), or, for
   * someone who came with a session and no seat, the first with room. Null when the one named is full.
   */
  const channelFor = (district: Running, named?: number): ChannelRoom | null => {
    const open = named === undefined ? district.channels.find((room) => room.room > 0) : district.channels.find((room) => room.number === named);
    if (open) return open.room > 0 ? open : null;
    let number = named ?? 1;
    while (named === undefined && district.channels.some((room) => room.number === number)) number++;
    const made = new ChannelRoom(district.deps, number);
    district.channels.push(made);
    district.channels.sort((a, b) => a.number - b.number);
    made.start();
    return made;
  };

  /** What this zone says of itself: where it is reached and who is in each channel. */
  const card = (): ZoneCard => ({
    id,
    address: options.address ?? "",
    rooms: [...running].map(([name, district]) => ({ name, channels: district.channels.map((room) => ({ number: room.number, players: room.count })) })),
  });
  const say = (): void => {
    if (!closing) void presence?.announce(card()).catch((error: unknown) => log(`zone: could not announce itself: ${String(error)}`));
  };

  const http = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    const rooms = [...running].flatMap(([name, district]) => district.channels.map((room) => ({ name, channel: room.number, players: room.count, steps: room.pace.steps, lastMs: room.pace.lastMs, worstMs: room.pace.worstMs, meanMs: room.pace.steps ? room.pace.totalMs / room.pace.steps : 0 })));
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ ok: true, rooms }));
  });
  const sockets = new WebSocketServer({ server: http, maxPayload: MESSAGE_AT_MOST_BYTES });

  sockets.on("connection", (socket: WebSocket, request) => {
    const asked = new URL(request.url ?? "/", "http://zone");
    const district = running.get(decodeURIComponent(asked.pathname.slice(1)));
    const paragem = asked.searchParams.get("paragem") ?? undefined;
    const line: Line = {
      send: (bytes) => {
        if (socket.readyState === socket.OPEN) socket.send(bytes);
      },
      close: (code) => socket.close(code),
    };
    let room: ChannelRoom | null = null;
    let joining = false;
    const refuse = (reason: JoinRefusalCode): void => {
      line.send(encodeJoinRefused({ reason, zoneVersion: PROTOCOL_VERSION }));
      socket.close(1000);
    };
    const patience = setTimeout(() => {
      if (!room && !joining) socket.close(ZONE_CLOSE.MISBEHAVED);
    }, JOIN_WITHIN_MS);

    /** The first message: who they are and what they speak. */
    const join = async (bytes: Uint8Array): Promise<void> => {
      let said;
      try {
        said = decodeClientMessage(bytes);
      } catch {
        return socket.close(ZONE_CLOSE.MISBEHAVED);
      }
      if (said.type !== "join") return socket.close(ZONE_CLOSE.MISBEHAVED);
      const verdict = negotiate(said.protocolVersion);
      if (verdict === "client_too_old") return refuse(JOIN_REFUSAL.REFRESH);
      if (verdict === "client_too_new") return refuse(JOIN_REFUSAL.RETRY);
      if (!district || closing) return refuse(JOIN_REFUSAL.RETRY);
      // A ticket for a seat here, taken once; or, where that is allowed, a session.
      const seat = presence && said.token.length > 0 ? await presence.claim(said.token) : null;
      if (seat && (seat.zoneId !== id || running.get(seat.room) !== district)) return refuse(JOIN_REFUSAL.BAD_SEAT);
      const player = seat ? { id: seat.playerId } : options.sessions && said.token.length > 0 ? await playerOfSession(sql, said.token) : null;
      if (!player) return refuse(JOIN_REFUSAL.BAD_SEAT);
      // The same player on another line, in any channel of any district: that line is put out, and when it was
      // in this district the newcomer stands where it stood. A player is in one place.
      let standing;
      for (const other of running.values()) {
        for (const channel of other.channels) {
          const old = channel.lineOf(player.id);
          if (!old) continue;
          const stood = await channel.leave(old);
          if (other === district && stood) standing = stood;
          old.close(ZONE_CLOSE.ELSEWHERE);
        }
      }
      const into = channelFor(district, seat?.channel);
      if (!into || !(await into.enter(line, player.id, paragem, standing))) return refuse(JOIN_REFUSAL.FULL);
      room = into;
      say();
      // Gone while the database was being asked: they were never really here.
      if (socket.readyState !== socket.OPEN) void leave();
    };

    const leave = async (): Promise<void> => {
      clearTimeout(patience);
      const was = room;
      room = null;
      if (!was || !district) return;
      await was.leave(line);
      // A channel nobody is in stops its clock and is forgotten; its number is free for the next.
      if (was.count === 0 && !closing) {
        was.stop();
        const at = district.channels.indexOf(was);
        if (at >= 0) district.channels.splice(at, 1);
      }
      say();
    };

    socket.on("message", (data: Buffer, isBinary: boolean) => {
      if (!isBinary) return socket.close(ZONE_CLOSE.MISBEHAVED);
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (room) return room.hear(line, bytes);
      // One Join at a time: whatever else arrives while it is being answered is not read.
      if (joining) return;
      joining = true;
      void join(bytes)
        .catch((error: unknown) => {
          log(`zone: a join failed: ${String(error)}`);
          socket.close(GOING_AWAY);
        })
        .finally(() => {
          joining = false;
        });
    });
    socket.on("close", () => void leave());
    socket.on("error", () => socket.terminate());
  });

  await new Promise<void>((ready, failed) => {
    http.once("error", failed);
    http.listen(port, "0.0.0.0", ready);
  });

  // Alive, and saying so: at once, and every few seconds after.
  say();
  const saying = setInterval(say, ZONE_SAYS_EVERY_S * 1000);

  return {
    id,
    roomNames: [...running.keys()],
    port,
    close: async () => {
      closing = true;
      clearInterval(saying);
      // Struck off first, so that nobody is sent here while it empties.
      await presence?.retire(id).catch((error: unknown) => log(`zone: could not retire itself: ${String(error)}`));
      // Everyone still in is written down on the way out, then the port is given back.
      await Promise.all([...running.values()].flatMap((district) => district.channels.map((room) => room.empty(GOING_AWAY))));
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>((done) => sockets.close(() => done()));
      await new Promise<void>((done) => http.close(() => done()));
    },
  };
}
