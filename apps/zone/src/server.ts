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

import { type Tunables } from "@nzila/economy";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { playerOfSession } from "@nzila/db";
import { type ChatFilter } from "@nzila/i18n";
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
/** Every line is asked "are you there?" this often; one that has not answered by the next asking is dead, whatever the network says. */
const ASK_EVERY_MS = 5000;
/**
 * Whether a line was closed on purpose. A phone that leaves says so (1000), a page that is closed says so (1001),
 * and the zone's own closings have their codes (4000 and up). Anything else is a line that fell: no network, a
 * tunnel, a phone put to sleep. The place of whoever was on it is kept a while (Task 3.4).
 */
const onPurpose = (code: number): boolean => code === 1000 || code === 1001 || code >= 4000;

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
  /** The game's numbers in play (Task 4.6): the newest version, kept fresh by the caller; the file's when not given. */
  readonly tunables?: () => Tunables;
  /** How long a dropped line's place is kept, and how often lines are asked whether they are there: the defaults unless a test brings shorter ones. */
  readonly holdMs?: number;
  /** For the tests: see ZoneDeps.doorstep. */
  readonly doorstep?: boolean;
  /** How long a quick game at a table lasts (three minutes; the browser tests' zone shortens it). */
  readonly rapidaMs?: number;
  readonly askEveryMs?: number;
  /** The word filter: given, talk is open; not given, nobody can say anything here (room.ts). */
  readonly filter?: ChatFilter;
  readonly log?: (line: string) => void;
}

export interface Zone {
  /** The name this process goes by in the presence: new each time it starts. */
  readonly id: string;
  /** The names a client asks for to be put in a channel of each district. */
  readonly roomNames: readonly string[];
  /** Every channel this zone has open: for its tests. */
  rooms(): readonly ChannelRoom[];
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
      deps: { sql, district, ...(remember === undefined ? {} : { remember }), ...(presence ? { presence } : {}), ...(options.holds ? { holds: options.holds } : {}), ...(options.tunables ? { tunables: options.tunables } : {}), ...(options.holdMs ? { holdMs: options.holdMs } : {}), ...(options.doorstep ? { doorstep: true } : {}), ...(options.rapidaMs ? { rapidaMs: options.rapidaMs } : {}), ...(options.filter ? { filter: options.filter } : {}), ...(options.log ? { log: options.log } : {}) },
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
    const made = new ChannelRoom(district.deps, number, () => tidy(district));
    district.channels.push(made);
    district.channels.sort((a, b) => a.number - b.number);
    made.start();
    return made;
  };

  /** A channel nobody is in stops its clock and is forgotten, its number free for the next; and the zone says who is left. */
  const tidy = (district: Running): void => {
    if (closing) return;
    for (const room of [...district.channels]) {
      if (room.count > 0) continue;
      room.retire();
      district.channels.splice(district.channels.indexOf(room), 1);
    }
    say();
  };

  /** What this zone says of itself: where it is reached and who is in each channel. */
  const card = (): ZoneCard => ({
    id,
    address: options.address ?? "",
    rooms: [...running].map(([name, district]) => ({ name, channels: district.channels.map((room) => ({ number: room.number, players: room.count, who: room.who, ...room.health() })) })),
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
  // "Are you there?": a line that fell without a word (the usual way on a phone) is found here, within ten seconds.
  const answered = new WeakSet<WebSocket>();
  const asking = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!answered.has(socket)) {
        socket.terminate();
        continue;
      }
      answered.delete(socket);
      socket.ping();
    }
  }, options.askEveryMs ?? ASK_EVERY_MS);

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
      // Someone whose line dropped comes back to the channel their body is standing in, whatever the seat says:
      // to everyone else they never left.
      const waiting = district.channels.find((channel) => channel.has(player.id));
      const into = waiting ?? channelFor(district, seat?.channel);
      // A player is in one place: any body of theirs in another channel, of any district, leaves it.
      for (const other of running.values()) {
        for (const channel of [...other.channels]) {
          if (channel === into || !channel.has(player.id)) continue;
          (await channel.putOut(player.id))?.close(ZONE_CLOSE.ELSEWHERE);
          tidy(other);
        }
      }
      if (!into || !(await into.enter(line, player.id, paragem))) return refuse(JOIN_REFUSAL.FULL);
      room = into;
      void presence?.unhold(player.id).catch(() => {});
      say();
      // Gone while the database was being asked: they were never really here.
      if (socket.readyState !== socket.OPEN) void leave();
    };

    const leave = async (code = 1000): Promise<void> => {
      clearTimeout(patience);
      const was = room;
      room = null;
      if (!was || !district) return;
      if (onPurpose(code) || closing) {
        await was.leave(line);
        return tidy(district);
      }
      // The line fell. The body stays where it is, and the API is told which channel is keeping the place.
      const playerId = was.drop(line);
      if (playerId) void presence?.hold({ playerId, zoneId: id, room: roomNameOf(district.deps.district.id), channel: was.number }).catch((error: unknown) => log(`zone: could not say a place is held: ${String(error)}`));
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
    socket.on("close", (code: number) => void leave(code));
    socket.on("error", () => socket.terminate());
    answered.add(socket);
    socket.on("pong", () => void answered.add(socket));
  });

  await new Promise<void>((ready, failed) => {
    // A port that is taken is said once and plainly, by whoever started the zone: nothing is announced from a zone that is not listening.
    http.once("error", failed);
    sockets.once("error", failed);
    http.listen(port, "0.0.0.0", ready);
  });

  // Alive, and saying so: at once, and every few seconds after.
  say();
  const saying = setInterval(say, ZONE_SAYS_EVERY_S * 1000);

  return {
    id,
    roomNames: [...running.keys()],
    rooms: () => [...running.values()].flatMap((district) => district.channels),
    port,
    close: async () => {
      closing = true;
      clearInterval(saying);
      clearInterval(asking);
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
