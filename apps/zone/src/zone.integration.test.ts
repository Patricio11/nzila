// A zone that really listens, a real PostgreSQL (`pnpm services`), and real
// clients on real sockets: what two phones in the same street would live.

import { randomBytes } from "node:crypto";
import { connect, databaseUrl, hashToken, loadMigrations, loadWorldSeed, migrate, seed } from "@nzila/db";
import {
  DOING,
  JOIN_REFUSAL,
  PROTOCOL_VERSION,
  ZONE_CLOSE,
  checkLook,
  decodeSnapshot,
  decodeZoneMessage,
  encodeInput,
  encodeJoin,
  type InputFrame,
  type JoinAccepted,
  type Snapshot,
  type Who,
  type WorldEvent,
  CHAT_REFUSAL,
  EVENT,
  encodeChatSend,
  encodeChatTyping,
  encodeEmote,
} from "@nzila/protocol";
import { createChatFilter } from "@nzila/i18n";
import { memoryPresence, pickChannel } from "@nzila/presence";
import { type Ground } from "@nzila/sim";
import postgres, { type Sql } from "postgres";
import { WebSocket as Cuttable } from "ws";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type District } from "./district.ts";
import { STEP_MS, STRIKES } from "./room.ts";
import { LINE_GAP_MS } from "./talk.ts";
import { startZone, type Zone } from "./server.ts";

const name = `nzila_zone_test_${process.pid}_${Date.now()}`;
const port = 21_000 + (process.pid % 20_000);
// A square of open ground 200 m across, with a wall along z = 30 m.
const ground: Ground = { cellMm: 500, flagsAt: (cx, cz) => (cz === 60 || Math.abs(cx) > 200 || Math.abs(cz) > 200 ? 0 : 1), heightAt: () => 0 };
const district: District = { id: "ao-lua/l1", provinceId: "ao-lua", ground, obstacles: [], paragens: new Map([
    ["mutamba", { x: 40_000, y: 0, z: -20_000, yaw: 0 }],
    // Three places along a line, for talk: together, ten metres off (seen to speak, not read), and thirty (out of hearing).
    ["conversa", { x: -60_000, y: 0, z: -60_000, yaw: 0 }],
    ["conversa-10", { x: -50_000, y: 0, z: -60_000, yaw: 0 }],
    ["conversa-30", { x: -30_000, y: 0, z: -60_000, yaw: 0 }],
  ]), arrival: { x: 0, y: 0, z: 0, yaw: 9000 } };
// A town the database has never heard of: played in, and nobody's place in it is kept.
const rehearsal: District = { ...district, id: "zz-dev/d1", provinceId: "zz-dev" };
const presence = memoryPresence();
const said: string[] = [];
let admin: Sql;
let sql: Sql;
let zone: Zone;

beforeAll(async () => {
  admin = postgres(databaseUrl(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(databaseUrl());
  url.pathname = `/${name}`;
  sql = connect(url.toString(), 10);
  await migrate(sql, await loadMigrations());
  await seed(sql, await loadWorldSeed());
  zone = await startZone({ sql, districts: [{ district }, { district: rehearsal, remember: false }], presence, sessions: true, filter: createChatFilter(["palavrao"]), log: (line) => void said.push(line) }, port);
}, 60_000);

afterAll(async () => {
  await zone?.close();
  await sql?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
  // Three suites drop their databases at the same moment: more than the ten seconds a hook is given.
}, 60_000);

let made = 0;
/** A player with a session, as the API would have made them. */
async function player(look?: object): Promise<{ id: string; token: string; name: string }> {
  const n = ++made;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO players (age_band, name, name_key, bi_number) VALUES ('18_plus', ${`Zona ${n}`}, ${`zona ${n}`}, ${`9${String(n).padStart(7, "0")}-LA`}) RETURNING id`;
  const token = randomBytes(32).toString("base64url");
  await sql`INSERT INTO player_sessions (player_id, token_hash, expires_at) VALUES (${row!.id}, ${hashToken(token)}, now() + interval '1 day')`;
  if (look) await sql`INSERT INTO avatars (player_id, spec) VALUES (${row!.id}, ${sql.json(look as never)})`;
  return { id: row!.id, token, name: `Zona ${n}` };
}

const until = async (what: () => boolean, ms = 4000): Promise<void> => {
  const end = Date.now() + ms;
  while (!what()) {
    if (Date.now() > end) throw new Error("waited too long");
    await new Promise((done) => setTimeout(done, 15));
  }
};
const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
/** For `until`: whether a place is being kept for a player, asked of the presence and remembered between askings. */
const async_held = (playerId: string): (() => boolean) => {
  let found = false;
  return () => {
    void presence.held(playerId).then((seat) => void (found ||= seat !== null));
    return found;
  };
};

const north: InputFrame = { dx: 0, dz: 127, run: false, brake: false };
const east: InputFrame = { dx: 127, dz: 0, run: false, brake: false };

class Refused extends Error {
  readonly reason: number;
  constructor(reason: number) {
    super(`refused: ${reason}`);
    this.reason = reason;
  }
}

/** A phone: it opens a line, says who it is, remembers what it is told, and can push its stick. */
async function phone(token: string, protocolVersion = PROTOCOL_VERSION, paragem?: string, roomName = "ao-lua.l1") {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/${roomName}${paragem ? `?paragem=${paragem}` : ""}`);
  socket.binaryType = "arraybuffer";
  const had = new Map<number, Snapshot>();
  const state = { accepted: null as JoinAccepted | null, refused: null as number | null, latest: null as Snapshot | null, snapshots: 0, bytes: 0, closed: null as number | null, seq: 0, who: [] as Who[], heard: [] as { from: number; text: string }[], typing: [] as { from: number; typing: boolean }[], events: [] as WorldEvent[] };
  socket.onopen = () => socket.send(encodeJoin({ protocolVersion, token }));
  socket.onmessage = (event: MessageEvent) => {
    const bytes = new Uint8Array(event.data as ArrayBuffer);
    state.bytes += bytes.length;
    const message = decodeZoneMessage(bytes);
    if (message.type === "join_accepted") state.accepted = message;
    if (message.type === "join_refused") state.refused = message.reason;
    if (message.type === "chat_heard") state.heard.push({ from: message.from, text: message.text });
    if (message.type === "chat_typing") state.typing.push({ from: message.from, typing: message.typing });
    if (message.type === "event") state.events.push(message);
    if (message.type === "who") state.who.push({ entityId: message.entityId, name: message.name, bi: message.bi, look: message.look });
    if (message.type === "snapshot") {
      const snapshot = decodeSnapshot(bytes, (tick) => had.get(tick));
      had.set(snapshot.tick, snapshot);
      state.latest = snapshot;
      state.snapshots++;
    }
  };
  socket.onclose = (event: CloseEvent) => void (state.closed = event.code);
  await until(() => (state.accepted !== null && state.latest !== null) || state.closed !== null);
  if (!state.accepted) throw new Refused(state.refused ?? -state.closed!);
  return {
    socket,
    state,
    me: () => state.latest!.entities.find((entity) => entity.id === state.accepted!.entityId)!,
    seen: (id: number) => state.latest!.entities.find((entity) => entity.id === id),
    /** Pushes the stick for a number of steps, at the pace a game would. */
    walk: async (steps: number, frame = north): Promise<void> => {
      for (let n = 0; n < steps; n++) {
        state.seq++;
        socket.send(encodeInput({ seq: state.seq, ackTick: state.latest!.tick, frames: [frame, frame, frame].slice(0, Math.min(3, state.seq)) }));
        await pause(STEP_MS);
      }
    },
    leave: async (): Promise<void> => {
      // Said aloud: a line that closes without a word is one that fell, and its place is kept.
      socket.close(1000);
      await until(() => state.closed !== null);
    },
  };
}

const refusedWith = async (attempt: Promise<unknown>): Promise<number> => {
  try {
    await attempt;
  } catch (error) {
    if (error instanceof Refused) return error.reason;
    throw error;
  }
  throw new Error("was let in");
};

describe("who may come in", () => {
  test("nobody without a session the API would accept, and no client that speaks a protocol the zone does not", async () => {
    expect(await refusedWith(phone("not-a-token-anyone-was-given"))).toBe(JOIN_REFUSAL.BAD_SEAT);
    const one = await player();
    expect(await refusedWith(phone(one.token, 0))).toBe(JOIN_REFUSAL.REFRESH);
    expect(await refusedWith(phone(one.token, PROTOCOL_VERSION + 1))).toBe(JOIN_REFUSAL.RETRY);
    // A session that was ended lets nobody in either.
    await sql`UPDATE player_sessions SET revoked_at = now() WHERE token_hash = ${hashToken(one.token)}`;
    expect(await refusedWith(phone(one.token))).toBe(JOIN_REFUSAL.BAD_SEAT);
    // A district this zone does not run: try again elsewhere, later.
    expect(await refusedWith(phone((await player()).token, PROTOCOL_VERSION, undefined, "ao-ben.b1"))).toBe(JOIN_REFUSAL.RETRY);
  });

  test("a player is told who they are here, in which district and channel, and arrives at the door", async () => {
    const one = await phone((await player()).token);
    expect(one.state.accepted).toMatchObject({ protocolVersion: PROTOCOL_VERSION, provinceId: "ao-lua", districtId: "ao-lua/l1", channel: 1 });
    expect(Math.abs(one.state.accepted!.serverTimeMs - Date.now())).toBeLessThan(5000);
    expect(Math.hypot(one.me().x, one.me().z)).toBeLessThan(3500);
    await one.leave();
  });
});

describe("two phones in the same street", () => {
  test("each sees the other; one walks, and the other sees them walk, where the zone says they are", async () => {
    const a = await phone((await player()).token);
    const b = await phone((await player()).token);
    const aId = a.state.accepted!.entityId;
    const bId = b.state.accepted!.entityId;
    expect(aId).not.toBe(bId);
    await until(() => a.seen(bId) !== undefined && b.seen(aId) !== undefined);
    // Nobody stands inside anybody.
    expect(Math.hypot(a.me().x - a.seen(bId)!.x, a.me().z - a.seen(bId)!.z)).toBeGreaterThan(500);

    // The second arrived a step north of the first, who therefore walks east: nobody walks through anybody (D-0.53).
    const from = { ...b.seen(aId)! };
    await a.walk(24, east);
    await until(() => b.seen(aId)!.x > from.x + 1000);
    expect(b.seen(aId)!.anim).toBe(DOING.walk);
    // A walking pace, whatever the phone would like: a little over a second is not five metres.
    expect(b.seen(aId)!.x - from.x).toBeLessThan(5000);
    // The one who walked is told the same place, and which of their frames were used.
    await until(() => a.state.latest!.lastInputSeq >= 20);
    await until(() => Math.abs(a.me().x - b.seen(aId)!.x) < 400);
    // And when they stop, they are seen to stand.
    await until(() => b.seen(aId)!.anim === DOING.idle);
    // The other never moved.
    expect(a.seen(bId)).toMatchObject({ x: b.me().x, z: b.me().z, anim: DOING.idle });
    await a.leave();
    // Who leaves is no longer in the street.
    await until(() => b.seen(aId) === undefined);
    await b.leave();
  });

  test("each is told who the other is, once: the name on their BI and the look they chose, and never a look the game would not accept", async () => {
    const look = { sex: "f", skin: 2, hair: "trancas", hairColour: "hairBlack", top: "blusa", topColour: "awningGold", bottom: "pano", bottomColour: "awningTeal", bands: "awningGold", shoe: "shoeTan" };
    expect(checkLook(look)).not.toBeNull();
    const dressed = await player(look);
    const tampered = await player({ sex: "m", skin: 99, hair: "<script>" });
    const a = await phone(dressed.token);
    const b = await phone(tampered.token);
    const aId = a.state.accepted!.entityId;
    const bId = b.state.accepted!.entityId;
    await until(() => b.state.who.some((who) => who.entityId === aId) && a.state.who.some((who) => who.entityId === bId));
    const ofA = b.state.who.find((who) => who.entityId === aId)!;
    expect(ofA.name).toBe(dressed.name);
    // And the number of their BI: what they can be blocked or reported by, and nothing more private than the card shows.
    expect(ofA.bi).toMatch(/^9\d{7}-LA$/);
    expect(ofA.look).toMatchObject({ sex: "f", hair: "trancas", bottom: "pano" });
    // The other's stored look is not one the game knows: it is not passed on. They are shown in a look of their own
    // all the same, made by the zone and good for the wardrobe.
    const ofB = a.state.who.find((who) => who.entityId === bId)!;
    expect(ofB.name).toBe(tampered.name);
    expect(JSON.stringify(ofB.look)).not.toContain("script");
    expect(checkLook(ofB.look)).not.toBeNull();
    // Nobody is told who they are themselves, and nobody is told twice.
    await a.walk(10, { dx: 0, dz: 0, run: false, brake: false });
    expect(a.state.who.filter((who) => who.entityId === bId)).toHaveLength(1);
    expect(a.state.who.some((who) => who.entityId === aId)).toBe(false);
    await a.leave();
    await b.leave();
  });

  test("standing still costs almost nothing to be told about", async () => {
    const a = await phone((await player()).token);
    const b = await phone((await player()).token);
    await a.walk(6, { dx: 0, dz: 0, run: false, brake: false });
    const before = { bytes: a.state.bytes, snapshots: a.state.snapshots };
    await a.walk(20, { dx: 0, dz: 0, run: false, brake: false });
    const snapshots = a.state.snapshots - before.snapshots;
    // About ten a second, each a handful of bytes when nothing has changed.
    expect(snapshots).toBeGreaterThanOrEqual(7);
    expect(snapshots).toBeLessThanOrEqual(13);
    expect((a.state.bytes - before.bytes) / snapshots).toBeLessThan(12);
    await a.leave();
    await b.leave();
  });
});

describe("where a player was", () => {
  test("is written down when they leave, and is where they arrive when they come back", async () => {
    const one = await player();
    const first = await phone(one.token);
    await first.walk(40);
    await until(() => first.me().z > 2000);
    await first.leave();
    let kept: { district_id: string; province_id: string; x: number; z: number } | undefined;
    for (let tries = 0; tries < 100 && !kept?.district_id; tries++) {
      [kept] = await sql<{ district_id: string; province_id: string; x: number; z: number }[]>`SELECT district_id, province_id, x, z FROM players WHERE id = ${one.id}`;
      if (!kept?.district_id) await pause(20);
    }
    expect(kept).toMatchObject({ district_id: "ao-lua/l1", province_id: "ao-lua" });
    expect(kept!.z).toBeGreaterThan(2000);
    const again = await phone(one.token);
    expect(Math.hypot(again.me().x - kept!.x, again.me().z - kept!.z)).toBeLessThan(100);
    await again.leave();
  });

  test("someone who got off a van comes back in beside the paragem they name, and a paragem that does not exist takes them nowhere", async () => {
    const one = await player();
    const off = await phone(one.token, PROTOCOL_VERSION, "mutamba");
    expect(Math.hypot(off.me().x - 40_000, off.me().z + 20_000)).toBeLessThan(3500);
    await off.leave();
    const lied = await phone(one.token, PROTOCOL_VERSION, "a-minha-casa");
    expect(Math.hypot(lied.me().x - 40_000, lied.me().z + 20_000)).toBeLessThan(3500);
    await lied.leave();
  });

  test("a rehearsal town is played in like any district, and nothing of where anyone stood there is kept", async () => {
    const one = await player();
    const there = await phone(one.token, PROTOCOL_VERSION, undefined, "zz-dev.d1");
    expect(there.state.accepted).toMatchObject({ districtId: "zz-dev/d1", channel: 1 });
    await there.walk(30);
    await until(() => there.me().z > 1000);
    await there.leave();
    await pause(150);
    const [kept] = await sql<{ district_id: string | null }[]>`SELECT district_id FROM players WHERE id = ${one.id}`;
    expect(kept!.district_id).toBeNull();
  });

  test("a player who comes in from a second place puts the first out, and stands where the first stood", async () => {
    const one = await player();
    const first = await phone(one.token);
    await first.walk(30);
    await until(() => first.me().z > 1500);
    const stood = first.me();
    const second = await phone(one.token);
    await until(() => first.state.closed !== null);
    expect(first.state.closed).toBe(ZONE_CLOSE.ELSEWHERE);
    expect(Math.hypot(second.me().x - stood.x, second.me().z - stood.z)).toBeLessThan(600);
    // One body, not two.
    expect(second.state.latest!.entities.filter((entity) => entity.id !== second.state.accepted!.entityId)).toHaveLength(0);
    await second.leave();
  });
});

describe("seats and the matchmaker", () => {
  const seat = (playerId: string, channel: number, room = "ao-lua.l1", zoneId = zone.id) => presence.reserve({ playerId, zoneId, room, channel });

  test("a ticket for a seat lets its player into the channel it names, once; and a ticket for somewhere else lets nobody in", async () => {
    const one = await player();
    const ticket = await seat(one.id, 3);
    const there = await phone(ticket);
    expect(there.state.accepted).toMatchObject({ districtId: "ao-lua/l1", channel: 3 });
    // Spent: shown again, it is nobody's.
    expect(await refusedWith(phone(ticket))).toBe(JOIN_REFUSAL.BAD_SEAT);
    // A seat in another zone, and a seat in another district's room, are not seats here.
    expect(await refusedWith(phone(await seat(one.id, 1, "ao-lua.l1", "zone-of-someone-else")))).toBe(JOIN_REFUSAL.BAD_SEAT);
    expect(await refusedWith(phone(await seat(one.id, 1, "zz-dev.d1")))).toBe(JOIN_REFUSAL.BAD_SEAT);
    await there.leave();
  });

  test("the zone says who is in each channel where the API reads it, and what it says sends the next player to meet the first", async () => {
    const one = await phone(await seat((await player()).id, 2));
    await until(() => false, 150).catch(() => {});
    const cards = await presence.zones();
    const mine = cards.find((card) => card.id === zone.id)!;
    expect(mine.address).toBe("");
    expect(mine.rooms.map((room) => room.name).sort()).toEqual(["ao-lua.l1", "zz-dev.d1"]);
    expect(mine.rooms.find((room) => room.name === "ao-lua.l1")!.channels).toEqual([{ number: 2, players: 1 }]);
    expect(pickChannel(cards, "ao-lua.l1", { fillTo: 60, cap: 80 })).toMatchObject({ zoneId: zone.id, channel: 2 });
    await one.leave();
    // The channel nobody is in is closed, and the zone says so at once.
    await until(() => false, 150).catch(() => {});
    expect((await presence.zones()).find((card) => card.id === zone.id)!.rooms.find((room) => room.name === "ao-lua.l1")!.channels).toEqual([]);
  });

  test("the way someone faced is kept with where they stood", async () => {
    const one = await player();
    const first = await phone(one.token);
    await first.walk(30, east);
    await until(() => first.me().yaw === 9000 && first.me().anim === DOING.idle);
    const stood = first.me();
    await first.leave();
    await until(() => false, 150).catch(() => {});
    expect(await presence.standing(one.id)).toMatchObject({ districtId: "ao-lua/l1", x: stood.x, z: stood.z, yaw: 9000 });
    const again = await phone(one.token);
    expect(again.me()).toMatchObject({ yaw: 9000 });
    expect(Math.hypot(again.me().x - stood.x, again.me().z - stood.z)).toBeLessThan(100);
    await again.leave();
  });

  test("a zone that players reach takes tickets and nothing else, holds no more than it is told, and is struck off when it closes", async () => {
    const strict = await startZone({ sql, districts: [{ district }], presence, address: "wss://zona.exemplo/z", holds: 1, log: (line) => void said.push(line) }, port + 1);
    const lines: WebSocket[] = [];
    const ask = (token: string): Promise<number> =>
      new Promise((done) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port + 1}/ao-lua.l1`);
        socket.binaryType = "arraybuffer";
        lines.push(socket);
        socket.onopen = () => socket.send(encodeJoin({ protocolVersion: PROTOCOL_VERSION, token }));
        socket.onmessage = (event: MessageEvent) => {
          const message = decodeZoneMessage(new Uint8Array(event.data as ArrayBuffer));
          if (message.type === "join_accepted") done(0);
          if (message.type === "join_refused") done(message.reason);
        };
      });
    const one = await player();
    const two = await player();
    // A session is not a ticket here.
    expect(await ask(one.token)).toBe(JOIN_REFUSAL.BAD_SEAT);
    expect((await presence.zones()).find((card) => card.id === strict.id)).toMatchObject({ address: "wss://zona.exemplo/z" });
    expect(await ask(await presence.reserve({ playerId: one.id, zoneId: strict.id, room: "ao-lua.l1", channel: 1 }))).toBe(0);
    // The channel holds one: a second seat in it is refused as full, and the phone goes back to the matchmaker.
    expect(await ask(await presence.reserve({ playerId: two.id, zoneId: strict.id, room: "ao-lua.l1", channel: 1 }))).toBe(JOIN_REFUSAL.FULL);
    await strict.close();
    for (const socket of lines) socket.close(1000);
    expect((await presence.zones()).some((card) => card.id === strict.id)).toBe(false);
  });
});

describe("talk in the street", () => {
  const send = (who: { socket: WebSocket }, bytes: Uint8Array): void => who.socket.send(bytes);

  test("a line is read by whoever is near, seen as a balloon by whoever is a little farther, and not known of beyond; and it is kept", async () => {
    const speaker = await player();
    const a = await phone(speaker.token, PROTOCOL_VERSION, "conversa");
    const near = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    const mid = await phone((await player()).token, PROTOCOL_VERSION, "conversa-10");
    const far = await phone((await player()).token, PROTOCOL_VERSION, "conversa-30");
    const aId = a.state.accepted!.entityId;
    // Each was told, on coming in, that talk is open here.
    expect(a.state.events.some((event) => event.kind === EVENT.CHAT_OPEN)).toBe(true);

    send(a, encodeChatSend({ messageId: 1, text: "  Bom   dia,\nvizinhos!  " }));
    await until(() => near.state.heard.length === 1 && mid.state.heard.length === 1 && a.state.heard.length === 1);
    expect(near.state.heard[0]).toEqual({ from: aId, text: "Bom dia, vizinhos!" });
    // Ten metres off: someone spoke. What they said was never sent.
    expect(mid.state.heard[0]).toEqual({ from: aId, text: "" });
    // The speaker hears their own line as it was said, tidied.
    expect(a.state.heard[0]).toEqual({ from: aId, text: "Bom dia, vizinhos!" });
    await pause(200);
    expect(far.state.heard).toEqual([]);
    // Sent twice over a bad line: said once.
    send(a, encodeChatSend({ messageId: 1, text: "Bom dia, vizinhos!" }));
    await pause(200);
    expect(near.state.heard).toHaveLength(1);

    for (const one of [a, near, mid, far]) await one.leave();
    // Kept for moderation: who, where, what, and how many read it.
    await until(() => false, 300).catch(() => {});
    const kept = await sql<{ text: string; said: boolean; heard_by: number; district_id: string; channel: number }[]>`SELECT text, said, heard_by, district_id, channel FROM chat_lines WHERE player_id = ${speaker.id}`;
    expect(kept).toEqual([{ text: "Bom dia, vizinhos!", said: true, heard_by: 1, district_id: "ao-lua/l1", channel: 1 }]);
  });

  test("a line with a word the game does not pass on is said to nobody; its speaker is told, kindly and alone, and it is kept; so is one too many too fast", async () => {
    const speaker = await player();
    const a = await phone(speaker.token, PROTOCOL_VERSION, "conversa");
    const near = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    send(a, encodeChatSend({ messageId: 5, text: "és um p4l4vr4o" }));
    await until(() => a.state.events.some((event) => event.kind === EVENT.CHAT_REFUSED));
    expect(a.state.events.find((event) => event.kind === EVENT.CHAT_REFUSED)).toMatchObject({ subject: 5, args: [CHAT_REFUSAL.WORDS] });
    // A line that was refused still counts against its speaker's pace: a breath, then two lines in the same instant, and the second is too fast.
    await pause(LINE_GAP_MS + 100);
    send(a, encodeChatSend({ messageId: 6, text: "agora" }));
    send(a, encodeChatSend({ messageId: 7, text: "já" }));
    await until(() => a.state.events.filter((event) => event.kind === EVENT.CHAT_REFUSED).length === 2);
    expect(a.state.events.filter((event) => event.kind === EVENT.CHAT_REFUSED)[1]).toMatchObject({ subject: 7, args: [CHAT_REFUSAL.SLOW_DOWN] });
    await pause(200);
    expect(near.state.heard).toEqual([{ from: a.state.accepted!.entityId, text: "agora" }]);
    expect(near.state.events.some((event) => event.kind === EVENT.CHAT_REFUSED)).toBe(false);
    await a.leave();
    await near.leave();
    await until(() => false, 300).catch(() => {});
    const kept = await sql<{ text: string; said: boolean }[]>`SELECT text, said FROM chat_lines WHERE player_id = ${speaker.id} ORDER BY id`;
    expect(kept).toEqual([
      { text: "és um p4l4vr4o", said: false },
      { text: "agora", said: true },
      { text: "já", said: false },
    ]);
  });

  test("three dots over whoever is typing, said when it starts and when it stops; and a gesture is seen by whoever has them in sight", async () => {
    const a = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    const near = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    const far = await phone((await player()).token, PROTOCOL_VERSION, "mutamba");
    const aId = a.state.accepted!.entityId;
    for (let n = 0; n < 4; n++) send(a, encodeChatTyping({ from: 0, typing: true }));
    await until(() => near.state.typing.length === 1);
    send(a, encodeChatTyping({ from: 0, typing: false }));
    await until(() => near.state.typing.length === 2);
    // The zone says who is typing: a client's own word for it is not taken.
    expect(near.state.typing).toEqual([{ from: aId, typing: true }, { from: aId, typing: false }]);
    expect(a.state.typing).toEqual([]);

    // Typing, then gone without a word: the dots do not stay over an empty place.
    send(a, encodeChatTyping({ from: 0, typing: true }));
    await until(() => near.state.typing.length === 3);
    send(a, encodeEmote({ emote: 4 }));
    send(a, encodeEmote({ emote: 1 }));
    await until(() => near.state.events.some((event) => event.kind === EVENT.EMOTE));
    // One gesture a second: the second, sent at once, is not passed on.
    await pause(200);
    expect(near.state.events.filter((event) => event.kind === EVENT.EMOTE)).toMatchObject([{ subject: aId, args: [4] }]);
    expect(far.state.events.some((event) => event.kind === EVENT.EMOTE)).toBe(false);
    expect(far.state.typing).toEqual([]);
    await a.leave();
    await until(() => near.state.typing.length === 4);
    expect(near.state.typing[3]).toEqual({ from: aId, typing: false });
    await near.leave();
    await far.leave();
  });

  test("two who have shut each other out do not hear each other, whoever did the shutting; everyone else hears both", async () => {
    const one = await player();
    const two = await player();
    await sql`INSERT INTO player_blocks (player_id, blocked_id) VALUES (${one.id}, ${two.id})`;
    const a = await phone(one.token, PROTOCOL_VERSION, "conversa");
    const b = await phone(two.token, PROTOCOL_VERSION, "conversa");
    const c = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    send(a, encodeChatSend({ messageId: 1, text: "ouves-me?" }));
    send(b, encodeChatSend({ messageId: 1, text: "e a mim?" }));
    send(b, encodeChatTyping({ from: 0, typing: true }));
    await until(() => c.state.heard.length === 2 && c.state.typing.length === 1);
    await pause(200);
    expect(a.state.heard.map((line) => line.text)).toEqual(["ouves-me?"]);
    expect(b.state.heard.map((line) => line.text)).toEqual(["e a mim?"]);
    expect(a.state.typing).toEqual([]);
    for (const each of [a, b, c]) await each.leave();
  });

  test("where talk is not open nobody is told it is, and nothing said is passed on or kept", async () => {
    const quiet = await startZone({ sql, districts: [{ district }], presence, sessions: true, log: (line) => void said.push(line) }, port + 3);
    const speaker = await player();
    const join = async (token: string) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port + 3}/ao-lua.l1`);
      socket.binaryType = "arraybuffer";
      const got: string[] = [];
      socket.onopen = () => socket.send(encodeJoin({ protocolVersion: PROTOCOL_VERSION, token }));
      socket.onmessage = (event: MessageEvent) => void got.push(decodeZoneMessage(new Uint8Array(event.data as ArrayBuffer)).type);
      await until(() => got.includes("snapshot"));
      return { socket, got };
    };
    const a = await join(speaker.token);
    const b = await join((await player()).token);
    a.socket.send(encodeChatSend({ messageId: 1, text: "está alguém?" }));
    a.socket.send(encodeChatTyping({ from: 0, typing: true }));
    await pause(300);
    for (const one of [a, b]) expect(one.got.filter((type) => type === "event" || type === "chat_heard" || type === "chat_typing")).toEqual([]);
    a.socket.close(1000);
    b.socket.close(1000);
    await quiet.close();
    expect(await sql`SELECT 1 FROM chat_lines WHERE player_id = ${speaker.id}`).toEqual([]);
  });
});

describe("a line that falls", () => {
  // A zone that keeps a place for a little over a second and asks its lines if they are there five times a second:
  // a minute and five seconds, in miniature.
  let quick: Zone;
  const at = port + 2;
  beforeAll(async () => {
    quick = await startZone({ sql, districts: [{ district }], presence, sessions: true, holdMs: 1200, askEveryMs: 200, log: (line) => void said.push(line) }, at);
  });
  afterAll(async () => {
    await quick.close();
  });

  /** A phone on a socket that can be cut without a word, or made to stop listening: what a tunnel does. */
  function cuttable(token: string) {
    const socket = new Cuttable(`ws://127.0.0.1:${at}/ao-lua.l1`);
    const had = new Map<number, Snapshot>();
    const state = { accepted: null as JoinAccepted | null, latest: null as Snapshot | null, closed: false, seq: 0 };
    socket.on("open", () => socket.send(encodeJoin({ protocolVersion: PROTOCOL_VERSION, token })));
    socket.on("close", () => void (state.closed = true));
    socket.on("error", () => {});
    socket.on("message", (data: Buffer) => {
      const bytes = new Uint8Array(data);
      const message = decodeZoneMessage(bytes);
      if (message.type === "join_accepted") state.accepted = message;
      if (message.type !== "snapshot") return;
      const snapshot = decodeSnapshot(bytes, (tick) => had.get(tick));
      had.set(snapshot.tick, snapshot);
      state.latest = snapshot;
    });
    return {
      socket,
      state,
      me: () => state.latest!.entities.find((entity) => entity.id === state.accepted!.entityId)!,
      seen: (id: number) => state.latest?.entities.find((entity) => entity.id === id),
      ready: () => until(() => state.accepted !== null && state.latest !== null),
      walk: async (steps: number, frame: InputFrame): Promise<void> => {
        for (let n = 0; n < steps; n++) {
          state.seq++;
          socket.send(encodeInput({ seq: state.seq, ackTick: state.latest!.tick, frames: [frame] }));
          await pause(STEP_MS);
        }
      },
    };
  }

  test("their body stays in the street, standing; they come back to it on a new line, the same person in the same place, and walk on", async () => {
    const one = await player();
    const watcher = cuttable((await player()).token);
    await watcher.ready();
    const first = cuttable(one.token);
    await first.ready();
    const body = first.state.accepted!.entityId;
    await first.walk(20, east);
    await until(() => first.me().x > 800 && first.me().anim === DOING.idle);
    const stood = first.me();

    // The line is cut, without a word.
    first.socket.terminate();
    await until(() => first.state.closed);
    await pause(300);
    // To the other they are still there, standing.
    expect(watcher.seen(body)).toMatchObject({ x: stood.x, z: stood.z, anim: DOING.idle });
    // And the API can read which channel is keeping the place.
    expect(await presence.held(one.id)).toEqual({ playerId: one.id, zoneId: quick.id, room: "ao-lua.l1", channel: 1 });

    // Back, on a new line whose count starts again.
    const again = cuttable(one.token);
    await again.ready();
    expect(again.state.accepted!.entityId).toBe(body);
    expect(again.me()).toMatchObject({ x: stood.x, z: stood.z });
    expect(await presence.held(one.id)).toBeNull();
    await again.walk(20, east);
    await until(() => again.me().x > stood.x + 800);
    // The other saw one body throughout, never two and never none.
    expect(watcher.state.latest!.entities).toHaveLength(2);
    // Well past the time a place is kept: they came back, so nothing takes them away.
    await pause(1400);
    expect(watcher.seen(body)).toBeDefined();
    again.socket.close(1000);
    watcher.socket.close(1000);
    await until(() => again.state.closed && watcher.state.closed);
  });

  test("a line that simply stops answering is found dead by asking, and its place is kept the same way", async () => {
    const one = await player();
    const quiet = cuttable(one.token);
    await quiet.ready();
    // The phone goes into a tunnel: nothing is closed, nothing more is heard from it.
    quiet.socket.pause();
    await until(async_held(one.id), 3000);
    expect((await presence.held(one.id))!.channel).toBe(1);
    quiet.socket.terminate();
  });

  test("someone who does not come back leaves the street when their time is up, and where they stood is written down", async () => {
    const one = await player();
    const watcher = cuttable((await player()).token);
    await watcher.ready();
    const gone = cuttable(one.token);
    await gone.ready();
    const body = gone.state.accepted!.entityId;
    await gone.walk(20, north);
    await until(() => gone.me().z > 800 && gone.me().anim === DOING.idle);
    const stood = gone.me();
    gone.socket.terminate();
    await until(() => watcher.seen(body) === undefined, 4000);
    await pause(100);
    const [kept] = await sql<{ district_id: string; x: number; z: number }[]>`SELECT district_id, x, z FROM players WHERE id = ${one.id}`;
    expect(kept).toMatchObject({ district_id: "ao-lua/l1", x: stood.x, z: stood.z });
    watcher.socket.close(1000);
    await until(() => watcher.state.closed);
    // The channel, with nobody in it and nobody awaited, is closed.
    await pause(100);
    expect(((await (await fetch(`http://127.0.0.1:${at}/health`)).json()) as { rooms: unknown[] }).rooms).toEqual([]);
  });
});

describe("a client that misbehaves", () => {
  test("is put out after sending, again and again, what no client of ours sends", async () => {
    const one = await phone((await player()).token);
    for (let n = 0; n < STRIKES; n++) one.socket.send(new Uint8Array([250, 1, 2, 3]));
    await until(() => one.state.closed !== null);
    expect(one.state.closed).toBe(ZONE_CLOSE.MISBEHAVED);
  });

  test("gains nothing by flooding: what is over a second's allowance is not read, and the flood ends with them outside", async () => {
    const one = await phone((await player()).token);
    const frames = Array.from({ length: 8 }, () => north);
    for (let burst = 0; burst < 30 && one.state.closed === null; burst++) {
      for (let n = 1; n <= 200; n++) one.socket.send(encodeInput({ seq: burst * 200 + n, ackTick: 0, frames }));
      await pause(250);
    }
    expect(one.state.closed).toBe(ZONE_CLOSE.MISBEHAVED);
  });

  test("a line that never says who it is, or says it in words, or says too much at once, is closed; and the zone says how it is doing to whoever asks", async () => {
    const wordy = new WebSocket(`ws://127.0.0.1:${port}/ao-lua.l1`);
    let closed: number | null = null;
    wordy.onclose = (event: CloseEvent) => void (closed = event.code);
    wordy.onopen = () => wordy.send("deixa-me entrar");
    await until(() => closed !== null);
    expect(closed).toBe(ZONE_CLOSE.MISBEHAVED);
    const huge = new WebSocket(`ws://127.0.0.1:${port}/ao-lua.l1`);
    let gone = false;
    huge.onclose = () => void (gone = true);
    huge.onerror = () => {};
    huge.onopen = () => huge.send(new Uint8Array(100_000));
    await until(() => gone);
    const one = await phone((await player()).token);
    const health = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as { ok: boolean; rooms: { name: string; channel: number; players: number; meanMs: number; worstMs: number }[] };
    expect(health.ok).toBe(true);
    expect(health.rooms.find((room) => room.name === "ao-lua.l1")).toMatchObject({ channel: 1, players: 1 });
    // A step of the world for a handful of people is a small part of a millisecond; fifty are the budget.
    expect(health.rooms[0]!.meanMs).toBeLessThan(5);
    expect((await fetch(`http://127.0.0.1:${port}/anything-else`)).status).toBe(404);
    await one.leave();
  });

  test("and through all of it the zone had nothing to complain of", () => {
    expect(said).toEqual([]);
  });
});
