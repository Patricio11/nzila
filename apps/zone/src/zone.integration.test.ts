// A zone that really listens, a real PostgreSQL (`pnpm services`), and real
// clients on real sockets: what two phones in the same street would live.

import { randomBytes } from "node:crypto";
import { Client, type Room } from "@colyseus/sdk";
import { connect, databaseUrl, hashToken, loadMigrations, loadWorldSeed, migrate, seed } from "@nzila/db";
import {
  CARRIER,
  DOING,
  JOIN_REFUSAL,
  JOIN_REFUSED_AT,
  PROTOCOL_VERSION,
  ZONE_CLOSE,
  decodeSnapshot,
  decodeZoneMessage,
  encodeInput,
  type InputFrame,
  type JoinAccepted,
  type Snapshot,
} from "@nzila/protocol";
import { type Ground } from "@nzila/sim";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type District } from "./district.ts";
import { STEP_MS, STRIKES } from "./room.ts";
import { startZone, type Zone } from "./server.ts";

const name = `nzila_zone_test_${process.pid}_${Date.now()}`;
const port = 21_000 + (process.pid % 20_000);
// A square of open ground 200 m across, with a wall along z = 30 m.
const ground: Ground = { cellMm: 500, flagsAt: (cx, cz) => (cz === 60 || Math.abs(cx) > 200 || Math.abs(cz) > 200 ? 0 : 1), heightAt: () => 0 };
const district: District = { id: "ao-lua/l1", provinceId: "ao-lua", ground, arrival: { x: 0, y: 0, z: 0, yaw: 9000 } };
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
  zone = await startZone({ sql, district, log: (line) => void said.push(line) }, port);
}, 60_000);

afterAll(async () => {
  await zone?.close();
  await sql?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

let made = 0;
/** A player with a session, as the API would have made them. */
async function player(): Promise<{ id: string; token: string }> {
  const n = ++made;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO players (age_band, name, name_key, bi_number) VALUES ('18_plus', ${`Zona ${n}`}, ${`zona ${n}`}, ${`9${String(n).padStart(7, "0")}-LA`}) RETURNING id`;
  const token = randomBytes(32).toString("base64url");
  await sql`INSERT INTO player_sessions (player_id, token_hash, expires_at) VALUES (${row!.id}, ${hashToken(token)}, now() + interval '1 day')`;
  return { id: row!.id, token };
}

const until = async (what: () => boolean, ms = 4000): Promise<void> => {
  const end = Date.now() + ms;
  while (!what()) {
    if (Date.now() > end) throw new Error("waited too long");
    await new Promise((done) => setTimeout(done, 15));
  }
};
const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const north: InputFrame = { dx: 0, dz: 127, run: false, brake: false };
const east: InputFrame = { dx: 127, dz: 0, run: false, brake: false };

/** A phone: it comes in with a token, remembers what it is told, and can push its stick. */
async function phone(token: string, protocolVersion = PROTOCOL_VERSION) {
  const client = new Client(`http://127.0.0.1:${port}`);
  client.auth.token = token;
  const room: Room = await client.joinOrCreate(zone.roomName, { protocolVersion });
  const had = new Map<number, Snapshot>();
  const state = { accepted: null as JoinAccepted | null, latest: null as Snapshot | null, snapshots: 0, bytes: 0, closed: null as number | null, seq: 0 };
  room.onMessage(CARRIER, (payload: Uint8Array) => {
    const bytes = new Uint8Array(payload);
    state.bytes += bytes.length;
    const message = decodeZoneMessage(bytes);
    if (message.type === "join_accepted") state.accepted = message;
    if (message.type === "snapshot") {
      const snapshot = decodeSnapshot(bytes, (tick) => had.get(tick));
      had.set(snapshot.tick, snapshot);
      state.latest = snapshot;
      state.snapshots++;
    }
  });
  room.onLeave((code: number) => void (state.closed = code));
  await until(() => state.accepted !== null && state.latest !== null);
  return {
    room,
    state,
    me: () => state.latest!.entities.find((entity) => entity.id === state.accepted!.entityId)!,
    seen: (id: number) => state.latest!.entities.find((entity) => entity.id === id),
    /** Pushes the stick for a number of steps, at the pace a game would. */
    walk: async (steps: number, frame = north): Promise<void> => {
      for (let n = 0; n < steps; n++) {
        state.seq++;
        room.sendBytes(CARRIER, encodeInput({ seq: state.seq, ackTick: state.latest!.tick, frames: [frame, frame, frame].slice(0, Math.min(3, state.seq)) }));
        await pause(STEP_MS);
      }
    },
    leave: async (): Promise<void> => {
      await room.leave();
      await until(() => state.closed !== null);
    },
  };
}

const refusedWith = async (attempt: Promise<unknown>): Promise<number> => {
  try {
    await attempt;
  } catch (error) {
    return (error as { code: number }).code;
  }
  throw new Error("was let in");
};

describe("who may come in", () => {
  test("nobody without a session the API would accept, and no client that speaks a protocol the zone does not", async () => {
    expect(await refusedWith(phone("not-a-token-anyone-was-given"))).toBe(JOIN_REFUSED_AT + JOIN_REFUSAL.BAD_SEAT);
    const one = await player();
    expect(await refusedWith(phone(one.token, 0))).toBe(JOIN_REFUSED_AT + JOIN_REFUSAL.REFRESH);
    expect(await refusedWith(phone(one.token, PROTOCOL_VERSION + 1))).toBe(JOIN_REFUSED_AT + JOIN_REFUSAL.RETRY);
    // A session that was ended lets nobody in either.
    await sql`UPDATE player_sessions SET revoked_at = now() WHERE token_hash = ${hashToken(one.token)}`;
    expect(await refusedWith(phone(one.token))).toBe(JOIN_REFUSED_AT + JOIN_REFUSAL.BAD_SEAT);
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

describe("a client that misbehaves", () => {
  test("is put out after sending, again and again, what no client of ours sends", async () => {
    const one = await phone((await player()).token);
    for (let n = 0; n < STRIKES; n++) one.room.sendBytes(CARRIER, new Uint8Array([250, 1, 2, 3]));
    await until(() => one.state.closed !== null);
    expect(one.state.closed).toBe(ZONE_CLOSE.MISBEHAVED);
  });

  test("gains nothing by flooding: what is over a second's allowance is not read, and the flood ends with them outside", async () => {
    const one = await phone((await player()).token);
    const frames = Array.from({ length: 8 }, () => north);
    for (let burst = 0; burst < 30 && one.state.closed === null; burst++) {
      for (let n = 1; n <= 200; n++) one.room.sendBytes(CARRIER, encodeInput({ seq: burst * 200 + n, ackTick: 0, frames }));
      await pause(250);
    }
    expect(one.state.closed).toBe(ZONE_CLOSE.MISBEHAVED);
  });

  test("and through all of it the zone had nothing to complain of", () => {
    expect(said).toEqual([]);
  });
});
