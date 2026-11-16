// The zone as a process that listens: its districts, and as many channels of
// each as there are people to fill them.
//
// A plain WebSocket and our own protocol, with no room library on either end
// (D-3.6, as revised): a library's client cost the phone 52 KB of a 300 KB
// budget for things our own messages already say. A client opens
// `/<district room>` (optionally `?paragem=<id>`), and its first message is a
// Join carrying the protocol it speaks and its session token. It is answered
// with JoinAccepted and then snapshots, or with JoinRefused and a closed line.
//
// `GET /health` says what is running and how long the steps are taking.

import { createServer } from "node:http";
import { playerOfSession } from "@nzila/db";
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
  readonly log?: (line: string) => void;
}

export interface Zone {
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
  const { sql } = options;
  const running = new Map<string, Running>();
  for (const { district, remember } of options.districts) {
    running.set(roomNameOf(district.id), { deps: { sql, district, ...(remember === undefined ? {} : { remember }), ...(options.log ? { log: options.log } : {}) }, channels: [] });
  }
  let closing = false;

  /** The first channel with room, or a new one: numbered with the lowest number nobody has. */
  const channelFor = (district: Running): ChannelRoom => {
    const open = district.channels.find((room) => room.room > 0);
    if (open) return open;
    let number = 1;
    while (district.channels.some((room) => room.number === number)) number++;
    const made = new ChannelRoom(district.deps, number);
    district.channels.push(made);
    district.channels.sort((a, b) => a.number - b.number);
    made.start();
    return made;
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
      const player = said.token.length > 0 ? await playerOfSession(sql, said.token) : null;
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
      const into = channelFor(district);
      if (!(await into.enter(line, player.id, paragem, standing))) return refuse(JOIN_REFUSAL.FULL);
      room = into;
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
          options.log?.(`zone: a join failed: ${String(error)}`);
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

  return {
    roomNames: [...running.keys()],
    port,
    close: async () => {
      closing = true;
      // Everyone still in is written down on the way out, then the port is given back.
      await Promise.all([...running.values()].flatMap((district) => district.channels.map((room) => room.empty(GOING_AWAY))));
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>((done) => sockets.close(() => done()));
      await new Promise<void>((done) => http.close(() => done()));
    },
  };
}
