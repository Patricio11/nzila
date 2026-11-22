// A zone that really listens, a real PostgreSQL (`pnpm services`), and real
// clients on real sockets: what two phones in the same street would live.

import { randomBytes } from "node:crypto";
import { connect, databaseUrl, hashToken, liftSanction, loadMigrations, loadWorldSeed, migrate, putStaff, sanction, seed } from "@nzila/db";
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
  encodeComer,
  encodeBanco,
  encodeBiscato,
  HIRED_VEHICLE_BASE,
} from "@nzila/protocol";
import { decodeCorridas, encodeCorrida, type CorridasSaid } from "@nzila/protocol/corridas";
import { SAIR_DITOS, SAIR_FINS, SAIR_RECUSAS, encodeSair } from "@nzila/protocol/sair";
import { A_DOIS_DITOS, encodeADois } from "@nzila/protocol";
import { MOVEL_RECUSAS, encodeMovel, encodePorta } from "@nzila/protocol/casa";
import { createChatFilter } from "@nzila/i18n";
import { memoryPresence, pickChannel } from "@nzila/presence";
import { type Ground } from "@nzila/sim";
import { homeGround, homeSeats, type HomeKind } from "@nzila/world";
import { scoreCarga } from "@nzila/sim/carga";
import { zungaRound } from "@nzila/sim/zunga";
import { carrosRound } from "@nzila/sim/carros";
import { PRATOS_FLICK, PRATOS_RUB, pratosRound, scorePratos, type PratosInput } from "@nzila/sim/pratos";
import postgres, { type Sql } from "postgres";
import { WebSocket as Cuttable } from "ws";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type District } from "./district.ts";
import { STEP_MS, STRIKES } from "./room.ts";
import { LINE_GAP_MS } from "./talk.ts";
import { startZone, type Zone } from "./server.ts";

const name = `nzila_zone_test_${process.pid}_${Date.now()}`;
const port = 21_000 + (process.pid % 20_000);
// A square of open ground 200 m across, with a wall along z = 30 m; a road across it from z = 50 to 55 m, and one up
// from it at x = 50 to 55 m (Task 6.2: rides go by road).
const onRoad = (cx: number, cz: number): boolean => (cz >= 100 && cz < 110) || (cx >= 100 && cx < 110 && cz > 60);
// And a house of five metres by five in a far corner (Phase 5, D-5.8): a wall to the street, open to its families.
const inHouse = (cx: number, cz: number): boolean => cx >= -170 && cx < -160 && cz >= -170 && cz < -160;
const ground: Ground = { cellMm: 500, flagsAt: (cx, cz) => (cz === 60 || Math.abs(cx) > 200 || Math.abs(cz) > 200 || inHouse(cx, cz) ? 0 : onRoad(cx, cz) ? 3 : 1), heightAt: () => 0 };
// Its plan, as the pack of homes would give it: a wall all round, floor inside, its doorway in the middle of the wall
// that looks to +Z (a wall to its families too while the door is shut, D-5.9), and the step before the door.
const casa: HomeKind = {
  id: "casa",
  model: "casa.glb",
  cellMm: 500,
  cellX0: -6,
  cellZ0: -6,
  rows: ["------------", "-##########-", ...Array.from({ length: 8 }, () => "-#........#-"), "-####dd####-", "-----..-----"],
  rect: [-2, -2, 2, 2],
  height: 2.6,
  floor: 0,
  door: [0, 2.5],
  wake: [0, 0],
  esteira: [1, 1],
  leaf: { hinge: [-0.5, 2.5], wide: 1, high: 2.1, sill: 0 },
};
const casaSite = { pos: [-82.5, 0, -82.5], facing: 0, kind: "casa" } as const;
const district: District = { id: "ao-lua/l1", provinceId: "ao-lua", ground, obstacles: [], paragens: new Map([
    ["mutamba", { x: 40_000, y: 0, z: -20_000, yaw: 0 }],
    // Three places along a line, for talk: together, ten metres off (seen to speak, not read), and thirty (out of hearing).
    ["conversa", { x: -60_000, y: 0, z: -60_000, yaw: 0 }],
    ["conversa-10", { x: -50_000, y: 0, z: -60_000, yaw: 0 }],
    ["conversa-30", { x: -30_000, y: 0, z: -60_000, yaw: 0 }],
    // Beside a bench, for sitting on it.
    ["banco", { x: -80_000, y: 0, z: 79_000, yaw: 0 }],
    // Beside the bacia of a kiosk, for washing plates (Task 4.5).
    ["pratos", { x: 60_000, y: 0, z: 59_000, yaw: 0 }],
    // And beside the carrinhos at a paragem, for carrying loads.
    ["carga", { x: 70_000, y: 0, z: 59_000, yaw: 0 }],
    // And beside the kitandeiras, for a bacia to sell from.
    ["zunga", { x: 80_000, y: 0, z: 59_000, yaw: 0 }],
    // And beside the lavadores' buckets, by the road.
    ["carros", { x: 90_000, y: 0, z: 59_000, yaw: 0 }],
    // On the pavement beside the road, to call a ride from.
    ["moto", { x: 20_000, y: 0, z: 57_000, yaw: 0 }],
    // Five metres west of the middle of a campo, where its ball lies.
    ["campo", { x: 73_000, y: 0, z: -83_000, yaw: 0 }],
    // In the street before the house, a little to one side of its middle.
    ["casa", { x: -81_000, y: 0, z: -78_000, yaw: 0 }],
    // And at the side of the same campo, out of the way of whoever goes for the ball.
    ["campo-lado", { x: 73_000, y: 0, z: -92_000, yaw: 0 }],
  ]), arrival: { x: 0, y: 0, z: 0, yaw: 9000 },
  // One bench's seat, facing +Z (F-205).
  benches: [{ x: -80_000, y: 450, z: 80_000, yaw: 0 }],
  // A kiosk's bacia, where plates are washed for pay.
  biscatos: [{ kind: "pratos", x: 60_000, z: 60_000 }, { kind: "carga", x: 70_000, z: 60_000 }, { kind: "zunga", x: 80_000, z: 60_000 }, { kind: "carros", x: 90_000, z: 60_000 }],
  // A caixa two metres from where people arrive.
  caixas: [{ x: 2000, z: 0 }],
  // The district's places, in the pack's order: one beside where people arrive, one where people talk.
  places: [{ x: 1500, z: 0 }, { x: -60_000, z: -60_000 }],
  // A barbearia where people talk (D-11.10).
  servicos: [{ kind: "corte", x: -60_000, z: -60_000 }],
  // The places two may go out to (Task 10.13): one beside the road up the second street, one where people talk.
  outings: [{ x: 50_000, z: 92_000 }, { x: -60_000, z: -60_000 }],
  // A way out to another bairro, at the paragem of the Mutamba (Task 11.2).
  // Two ways out at one paragem (a paragem may lead to more than one bairro), and one far from it.
  gateways: [{ id: "para-fora", x: 40_000, z: -20_000, to: "ao-lua/outro", arrive: "chegada" }, { id: "para-longe", x: 41_000, z: -20_000, to: "ao-lua/longe", arrive: "largo" }, { id: "para-la", x: -90_000, z: 90_000, to: "ao-lua/la", arrive: "ali" }],
  // The one house families are given here: its inside is all of it but a hand's breadth of wall.
  homes: (house, family, open, taken) =>
    house === 1
      ? {
          own: { ground: homeGround(ground, casaSite, casa, open, taken), rect: [-84_500, -84_500, -80_500, -80_500], key: family },
          wake: { x: -82_500, y: 0, z: -82_500, yaw: 0 },
          door: { x: -82_500, z: -80_000 },
          kind: casa,
          seatsOf: (things) => homeSeats(casaSite, casa, things),
          cellAt: (x, z) => [Math.floor((x + 82_500) / 500), Math.floor((z + 82_500) / 500)],
        }
      : null,
  // A campo of forty metres by twenty-six, far from everything else, with its ball.
  campos: [{ x0: 58_000, z0: -96_000, x1: 98_000, z1: -70_000, goal: 2600 }] };
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
  zone = await startZone({ sql, districts: [{ district }, { district: rehearsal, remember: false }], presence, sessions: true, doorstep: true, filter: createChatFilter(["palavrao"]), log: (line) => void said.push(line) }, port);
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
  const state = { accepted: null as JoinAccepted | null, refused: null as number | null, latest: null as Snapshot | null, snapshots: 0, bytes: 0, closed: null as number | null, seq: 0, who: [] as Who[], heard: [] as { from: number; text: string }[], typing: [] as { from: number; typing: boolean }[], events: [] as WorldEvent[], corridas: null as CorridasSaid | null };
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
    if (message.type === "corridas") state.corridas = decodeCorridas(message.bytes);
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

    // The second arrived a step east or west of the first (F-189), who therefore walks north: nobody walks through anybody (D-0.53).
    const from = { ...b.seen(aId)! };
    await a.walk(24, north);
    await until(() => b.seen(aId)!.z > from.z + 1000);
    expect(b.seen(aId)!.anim).toBe(DOING.walk);
    // A walking pace, whatever the phone would like: a little over a second is not five metres.
    expect(b.seen(aId)!.z - from.z).toBeLessThan(5000);
    // The one who walked is told the same place, and which of their frames were used.
    await until(() => a.state.latest!.lastInputSeq >= 20);
    await until(() => Math.abs(a.me().z - b.seen(aId)!.z) < 400);
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

  test("Fome and Energia (Task 4.4): told on arriving; too tired, a run is walked; a drink and a loaf from the Mochila give back and leave it; rice and what is not carried are refused; written down on leaving", async () => {
    const one = await player();
    await sql`UPDATE players SET fome = 3000, energia = 500 WHERE id = ${one.id}`;
    await sql`INSERT INTO items (owner_id, item, quantity) VALUES (${one.id}, 'pao', 2), (${one.id}, 'gasosa', 1), (${one.id}, 'arroz', 1)`;
    const p = await phone(one.token);
    const needs = (): WorldEvent[] => p.state.events.filter((event) => event.kind === EVENT.NECESSIDADES);
    const refused = (): string[] => p.state.events.filter((event) => event.kind === EVENT.COMER_RECUSADO).map((event) => event.text);
    await until(() => needs().length > 0);
    // As written, and too tired (under 800).
    expect(needs()[0]!.args).toEqual([3000, 500, 1]);
    // Too tired: the stick pushed with the run held walks, at a walk's pace.
    const ran = async (): Promise<number> => {
      const from = p.me();
      await p.walk(20, { ...north, run: true });
      await until(() => p.me().anim === DOING.idle);
      return p.me().z - from.z;
    };
    const tiredRun = await ran();
    // A gasosa: Energia back over the line, and the run is a run again.
    p.socket.send(encodeComer({ item: "gasosa" }));
    await until(() => needs().some((event) => event.text === "gasosa"));
    const drank = needs().find((event) => event.text === "gasosa")!;
    expect(drank.args[1]).toBeGreaterThan(1150);
    expect(drank.args[2]).toBe(0);
    const freshRun = await ran();
    expect(freshRun).toBeGreaterThan(tiredRun * 1.6);
    // A loaf: Fome back by what a loaf gives (and the gasosa's 100), less the little that time took; one loaf left.
    p.socket.send(encodeComer({ item: "pao" }));
    await until(() => needs().some((event) => event.text === "pao"));
    const ate = needs().find((event) => event.text === "pao")!;
    expect(ate.args[0]).toBeGreaterThan(3000 + 100 + 900 - 30);
    expect(ate.args[0]).toBeLessThanOrEqual(3000 + 100 + 900);
    expect(await sql`SELECT item, quantity FROM items WHERE owner_id = ${one.id} ORDER BY item`).toEqual([{ item: "arroz", quantity: 1 }, { item: "pao", quantity: 1 }]);
    // Rice is cooked at home; the gasosa is gone.
    p.socket.send(encodeComer({ item: "arroz" }));
    p.socket.send(encodeComer({ item: "gasosa" }));
    await until(() => refused().length === 2);
    expect(refused().sort()).toEqual(["nao_se_come", "nao_tens"]);
    // Leaving, they are written down as the zone has them.
    await p.leave();
    let kept: { fome: number; energia: number } | undefined;
    for (let n = 0; n < 40 && !(kept && kept.fome !== 3000); n++) {
      [kept] = await sql<{ fome: number; energia: number }[]>`SELECT fome, energia FROM players WHERE id = ${one.id}`;
      await pause(50);
    }
    expect(kept!.fome).toBeGreaterThan(3000 + 900 - 60);
    expect(kept!.energia).toBeGreaterThan(1100);
    // Two walks, meals and the database: more than an integration test's fifteen seconds when the gate is loaded (F-176).
  }, 30_000);

  test("a bench (F-205, Task 4.4): sat on from beside it and seen sitting by another; nobody else's to take; got up in front of it; rested on", async () => {
    const one = await player();
    await sql`UPDATE players SET energia = 2000 WHERE id = ${one.id}`;
    const a = await phone(one.token, PROTOCOL_VERSION, "banco");
    const b = await phone((await player()).token, PROTOCOL_VERSION, "banco");
    const aId = a.state.accepted!.entityId;
    a.socket.send(encodeBanco({ seat: 0, sim: true }));
    await until(() => a.me().anim === DOING.sit);
    expect(a.me()).toMatchObject({ x: -80_000, z: 80_000 });
    // Everyone else sees them sitting there.
    await until(() => b.seen(aId)?.anim === DOING.sit);
    // Taken: the other is not seated on it; and a seat the district has not is nothing.
    b.socket.send(encodeBanco({ seat: 0, sim: true }));
    b.socket.send(encodeBanco({ seat: 9, sim: true }));
    await pause(400);
    expect(b.me().anim).not.toBe(DOING.sit);
    // Rested a while, then up, a step in front of the bench.
    await pause(3000);
    a.socket.send(encodeBanco({ seat: 0, sim: false }));
    await until(() => a.me().anim !== DOING.sit);
    expect(Math.hypot(a.me().x - -80_000, a.me().z - 80_600)).toBeLessThan(700);
    await b.leave();
    await a.leave();
    // Sitting gave back more Energia than the time took: 6 000 an hour against 2 500.
    let kept: { energia: number } | undefined;
    for (let n = 0; n < 40 && !(kept && kept.energia !== 2000); n++) {
      [kept] = await sql<{ energia: number }[]>`SELECT energia FROM players WHERE id = ${one.id}`;
      await pause(50);
    }
    expect(kept!.energia).toBeGreaterThan(2000);
    // Two walks, meals and the database: more than an integration test's fifteen seconds when the gate is loaded (F-176).
  }, 30_000);

  test("a biscato (Task 4.5): only at its place; a seed for the round; the thumb's inputs, never ahead of the zone's clock, scored as the rules say; a note for the pay; the work tires", async () => {
    const one = await player();
    await sql`UPDATE players SET fome = 6000, energia = 6000 WHERE id = ${one.id}`;
    const p = await phone(one.token);
    const events = (kind: number): WorldEvent[] => p.state.events.filter((event) => event.kind === kind);
    // Where people arrive there is no bacia.
    p.socket.send(encodeBiscato({ op: "comecar", kind: "pratos" }));
    await until(() => events(EVENT.BISCATO_RECUSADO).length === 1);
    expect(events(EVENT.BISCATO_RECUSADO)[0]!.text).toBe("longe");
    await p.leave();
    const q = await phone(one.token, PROTOCOL_VERSION, "pratos");
    const heard = (kind: number): WorldEvent[] => q.state.events.filter((event) => event.kind === kind);
    q.socket.send(encodeBiscato({ op: "comecar", kind: "pratos" }));
    await until(() => heard(EVENT.BISCATO).length === 1);
    const begun = heard(EVENT.BISCATO)[0]!;
    expect(begun.text).toBe("pratos");
    const [seed, lengthMs] = begun.args as [number, number];
    expect(lengthMs).toBe(75_000);
    // One round at a time.
    q.socket.send(encodeBiscato({ op: "comecar", kind: "pratos" }));
    await until(() => heard(EVENT.BISCATO_RECUSADO).length === 1);
    expect(heard(EVENT.BISCATO_RECUSADO)[0]!.text).toBe("ocupado");
    // The first plate rubbed clean and flicked onto the escorredor, as a hand would, in the round's first second.
    const round = pratosRound(seed, lengthMs);
    const washed: PratosInput[] = [...Array.from({ length: round[0]!.dirt }, (_, n): PratosInput => ({ t: n * 130, what: PRATOS_RUB })), { t: round[0]!.dirt * 130, what: PRATOS_FLICK }];
    await pause(round[0]!.dirt * 130 + 300);
    q.socket.send(encodeBiscato({ op: "mais", inputs: washed }));
    // A batch from a minute ahead of the zone's clock is not a hand's: none of it counts.
    q.socket.send(encodeBiscato({ op: "mais", inputs: [{ t: 60_000, what: 0 }, { t: 60_100, what: 1 }] }));
    q.socket.send(encodeBiscato({ op: "acabar" }));
    await until(() => heard(EVENT.BISCATO_FIM).length === 1);
    const scored = heard(EVENT.BISCATO_FIM)[0]!;
    const expected = scorePratos(round, washed, lengthMs);
    expect(scored.args).toEqual([expected.score, 1, 0, round.length]);
    expect(expected.score).toBeGreaterThan(0);
    // The API's note: which round, which biscato, what it scored.
    expect(await presence.marked(one.id, "biscato")).toBe(`${scored.text}:pratos:${expected.score}`);
    // The work took a little of the body: as much of it as was played.
    const after = heard(EVENT.NECESSIDADES).at(-1)!;
    expect(after.args[1]).toBeLessThan(6000);
    expect(after.args[1]).toBeGreaterThan(6000 - 100);
    await q.leave();
    // Too tired to work: refused, and nothing begun.
    const tired = await player();
    await sql`UPDATE players SET energia = 300 WHERE id = ${tired.id}`;
    const r = await phone(tired.token, PROTOCOL_VERSION, "pratos");
    r.socket.send(encodeBiscato({ op: "comecar", kind: "pratos" }));
    await until(() => r.state.events.some((event) => event.kind === EVENT.BISCATO_RECUSADO));
    expect(r.state.events.find((event) => event.kind === EVENT.BISCATO_RECUSADO)!.text).toBe("cansado");
    expect(r.state.events.some((event) => event.kind === EVENT.BISCATO)).toBe(false);
    await r.leave();
  }, 30_000);

  test("levar carga (Task 4.5): a biscato of its own place and length, scored by its own rules; the bacia's place is not the carrinho's", async () => {
    const one = await player();
    const p = await phone(one.token, PROTOCOL_VERSION, "carga");
    const heard = (kind: number): WorldEvent[] => p.state.events.filter((event) => event.kind === kind);
    // Plates are not washed at the carrinhos.
    p.socket.send(encodeBiscato({ op: "comecar", kind: "pratos" }));
    await until(() => heard(EVENT.BISCATO_RECUSADO).length === 1);
    expect(heard(EVENT.BISCATO_RECUSADO)[0]!.text).toBe("longe");
    p.socket.send(encodeBiscato({ op: "comecar", kind: "carga" }));
    await until(() => heard(EVENT.BISCATO).length === 1);
    const [seed, lengthMs] = heard(EVENT.BISCATO)[0]!.args as [number, number];
    expect(lengthMs).toBe(90_000);
    const taps = [{ t: 100, what: 0 }, { t: 400, what: 1 }] as const;
    await pause(600);
    p.socket.send(encodeBiscato({ op: "mais", inputs: [...taps] }));
    p.socket.send(encodeBiscato({ op: "acabar" }));
    await until(() => heard(EVENT.BISCATO_FIM).length === 1);
    const expected = scoreCarga(seed, lengthMs, [...taps], 3000);
    try {
      // Whether a stack has fallen by the end depends on how long the round really ran, which a busy machine
      // stretches (F-262): what was scored, delivered and there to do are held exactly, and no stack fell that could not have.
      const [score, delivered, fallen, most] = heard(EVENT.BISCATO_FIM)[0]!.args;
      expect([score, delivered, most]).toEqual([expected.score, expected.delivered, expected.most]);
      expect(fallen).toBeLessThanOrEqual(expected.fallen);
      // Nothing delivered, nothing to pay: no note is left.
      expect(await presence.marked(one.id, "biscato")).toBeNull();
    } finally {
      // Whatever came of it, they leave: someone left standing here fails every test after this one.
      await p.leave();
    }
  }, 30_000);

  test("zunga (Task 4.5): the first passer-by given what they want is a sale; those not yet come are not counted as walked on", async () => {
    const one = await player();
    const p = await phone(one.token, PROTOCOL_VERSION, "zunga");
    const heard = (kind: number): WorldEvent[] => p.state.events.filter((event) => event.kind === kind);
    p.socket.send(encodeBiscato({ op: "comecar", kind: "zunga" }));
    await until(() => heard(EVENT.BISCATO).length === 1);
    const [seed, lengthMs] = heard(EVENT.BISCATO)[0]!.args as [number, number];
    const first = zungaRound(seed, lengthMs)[0]!;
    // Given the right thing as soon as they stop.
    await pause(first.from + 300);
    p.socket.send(encodeBiscato({ op: "mais", inputs: [{ t: first.from + 100, what: first.want }] }));
    p.socket.send(encodeBiscato({ op: "acabar" }));
    await until(() => heard(EVENT.BISCATO_FIM).length === 1);
    const [score, sold, failed, most] = heard(EVENT.BISCATO_FIM)[0]!.args;
    expect(sold).toBe(1);
    expect(failed).toBe(0);
    expect(score).toBe(Math.trunc(1000 / most!));
    expect(await presence.marked(one.id, "biscato")).toMatch(new RegExp(`:zunga:${score}$`));
    await p.leave();
  }, 30_000);

  test("lavar carros (Task 4.5): the first car gone over part by part is washed, and drives off", async () => {
    const one = await player();
    const p = await phone(one.token, PROTOCOL_VERSION, "carros");
    const heard = (kind: number): WorldEvent[] => p.state.events.filter((event) => event.kind === kind);
    p.socket.send(encodeBiscato({ op: "comecar", kind: "carros" }));
    await until(() => heard(EVENT.BISCATO).length === 1);
    const [seed, lengthMs] = heard(EVENT.BISCATO)[0]!.args as [number, number];
    expect(lengthMs).toBe(90_000);
    // Every layer of every dirty part of the first car, a pass each, a tenth of a second apart.
    const first = carrosRound(seed, lengthMs)[0]!;
    const passes = first.dirt.flatMap((layers, part) => Array.from({ length: layers }, () => part)).map((part, n) => ({ t: n * 100, what: part }));
    await pause(passes.length * 100 + 300);
    p.socket.send(encodeBiscato({ op: "mais", inputs: passes }));
    p.socket.send(encodeBiscato({ op: "acabar" }));
    await until(() => heard(EVENT.BISCATO_FIM).length === 1);
    const [score, washed, failed, most] = heard(EVENT.BISCATO_FIM)[0]!.args;
    expect([washed, failed]).toEqual([1, 0]);
    expect(score).toBe(Math.trunc(1000 / most!));
    await p.leave();
  }, 30_000);

  test("a ride asked for (Task 6.2): sent only on a paid note; seen coming along the road by everyone; waits at the kerb; got on; carried by road; set down near where asked", async () => {
    const one = await player();
    const p = await phone(one.token, PROTOCOL_VERSION, "moto");
    const watcher = await phone((await player()).token, PROTOCOL_VERSION, "moto");
    const heard = (kind: number): WorldEvent[] => p.state.events.filter((event) => event.kind === kind);
    // Nothing paid: nothing sent.
    p.socket.send(encodeCorrida({ op: "pedir", id: "nao-paga-0001" }));
    await until(() => heard(EVENT.CORRIDA_RECUSADA).length === 1);
    expect(heard(EVENT.CORRIDA_RECUSADA)[0]!.text).toBe("nao_paga");
    // Paid (the API's note): to the road up the second street.
    await presence.mark(one.id, "corrida", "corrida-teste-01:mota:52000:90000", 120);
    p.socket.send(encodeCorrida({ op: "pedir", id: "corrida-teste-01" }));
    await until(() => heard(EVENT.CORRIDA).length === 1);
    const [vehicle, fase] = heard(EVENT.CORRIDA)[0]!.args;
    expect(vehicle).toBeGreaterThanOrEqual(HIRED_VEHICLE_BASE);
    expect([fase, heard(EVENT.CORRIDA)[0]!.text]).toEqual([0, "mota"]);
    // Everyone in the channel sees it: coming along the road, ending at the kerb beside the player.
    await until(() => watcher.state.corridas?.rides.some((ride) => ride.vehicle === vehicle) === true);
    const coming = watcher.state.corridas!.rides.find((ride) => ride.vehicle === vehicle)!;
    const kerb = coming.path.at(-1)!;
    expect(Math.hypot(kerb.x - p.me().x, kerb.z - p.me().z)).toBeLessThan(3500);
    for (const point of coming.path) expect(ground.flagsAt(Math.floor(point.x / 500), Math.floor(point.z / 500)) & 2, JSON.stringify(coming.path)).toBe(2);
    // The same note is good for one ride.
    p.socket.send(encodeCorrida({ op: "pedir", id: "corrida-teste-01" }));
    await until(() => heard(EVENT.CORRIDA_RECUSADA).length === 2);
    expect(heard(EVENT.CORRIDA_RECUSADA)[1]!.text).toBe("ocupado");
    // At the kerb, waiting; got on.
    await until(() => heard(EVENT.CORRIDA).some((event) => event.args[1] === 1), 20_000);
    p.socket.send(encodeCorrida({ op: "subir" }));
    await until(() => heard(EVENT.CORRIDA).some((event) => event.args[1] === 2));
    await until(() => p.me().vehicleId === vehicle);
    // Carried along the road, and set down beside it near where they asked.
    await until(() => heard(EVENT.CORRIDA).some((event) => event.text === "chegou"), 25_000);
    await until(() => p.me().vehicleId === null);
    expect(Math.hypot(p.me().x - 52_000, p.me().z - 90_000)).toBeLessThan(6000);
    await watcher.leave();
    await p.leave();
  }, 60_000);

  test("going out (Task 10.13): only two adults who have not shut each other out; a place asked, another answered, agreed; a táxi for two takes both and sets them down together; they arrive; it ends", async () => {
    const [ana, rui, eva] = [await player(), await player(), await player()];
    const [novo] = await sql<{ id: string }[]>`INSERT INTO players (age_band, name, name_key, bi_number) VALUES ('15_17', 'Novo Sair', 'novo sair', '98888888-LA') RETURNING id`;
    const novoToken = randomBytes(32).toString("base64url");
    await sql`INSERT INTO player_sessions (player_id, token_hash, expires_at) VALUES (${novo!.id}, ${hashToken(novoToken)}, now() + interval '1 day')`;
    // Eva has shut Ana out, before either came in.
    await sql`INSERT INTO player_blocks (player_id, blocked_id) VALUES (${eva.id}, ${ana.id})`;
    const a = await phone(ana.token, PROTOCOL_VERSION, "moto");
    const r = await phone(rui.token, PROTOCOL_VERSION, "moto");
    const e = await phone(eva.token, PROTOCOL_VERSION, "moto");
    const n = await phone(novoToken, PROTOCOL_VERSION, "moto");
    const said = (who: typeof a, what: (typeof SAIR_DITOS)[number]): WorldEvent[] => who.state.events.filter((event) => event.kind === EVENT.SAIR && event.args[0] === SAIR_DITOS.indexOf(what));
    const id = (who: typeof a): number => who.state.accepted!.entityId;
    const refusals = (who: typeof a): string[] => said(who, "recusado").map((event) => SAIR_RECUSAS[event.args[1]!]!);

    // Never across the age bands, whoever asks; never across a block, whoever shut whom out. Said the same each time.
    a.socket.send(encodeSair({ op: "convidar", entidade: id(n), lugar: 0 }));
    n.socket.send(encodeSair({ op: "convidar", entidade: id(a), lugar: 0 }));
    a.socket.send(encodeSair({ op: "convidar", entidade: id(e), lugar: 0 }));
    e.socket.send(encodeSair({ op: "convidar", entidade: id(a), lugar: 0 }));
    await until(() => refusals(a).length === 2 && refusals(n).length === 1 && refusals(e).length === 1);
    expect([...refusals(a), ...refusals(n), ...refusals(e)]).toEqual(["nao_pode", "nao_pode", "nao_pode", "nao_pode"]);
    expect([said(n, "convite"), said(e, "convite"), said(a, "convite")].map((list) => list.length)).toEqual([0, 0, 0]);
    // Nor a place the district does not have, nor oneself.
    a.socket.send(encodeSair({ op: "convidar", entidade: id(r), lugar: 9 }));
    a.socket.send(encodeSair({ op: "convidar", entidade: id(a), lugar: 0 }));
    await until(() => refusals(a).length === 4);
    expect(said(r, "convite")).toEqual([]);

    // Ana asks Rui to the second place; Rui would rather the first; Ana says yes: both are told, and of the place.
    a.socket.send(encodeSair({ op: "convidar", entidade: id(r), lugar: 1 }));
    await until(() => said(r, "convite").length === 1);
    expect(said(r, "convite")[0]).toMatchObject({ subject: id(a), args: [0, 1] });
    r.socket.send(encodeSair({ op: "outro", entidade: id(a), lugar: 0 }));
    await until(() => said(a, "convite").length === 1);
    expect(said(a, "convite")[0]).toMatchObject({ subject: id(r), args: [0, 0, 1] });
    a.socket.send(encodeSair({ op: "aceitar", entidade: id(r) }));
    await until(() => said(a, "combinado").length === 1 && said(r, "combinado").length === 1);
    expect([said(a, "combinado")[0], said(r, "combinado")[0]]).toMatchObject([{ subject: id(r), args: [2, 0] }, { subject: id(a), args: [2, 0] }]);
    // Out with someone: neither is asked by anyone else meanwhile.
    e.socket.send(encodeSair({ op: "convidar", entidade: id(r), lugar: 0 }));
    await until(() => refusals(e).length === 2);
    expect(refusals(e)[1]).toBe("ocupado");

    // A táxi for two, paid by Ana (the API's note says "for two"): both are told of it, both get in, and only then it goes.
    const rides = (who: typeof a): WorldEvent[] => who.state.events.filter((event) => event.kind === EVENT.CORRIDA);
    await presence.mark(ana.id, "corrida", "corrida-dois-0001:taxi:52000:90000:2", 120);
    a.socket.send(encodeCorrida({ op: "pedir", id: "corrida-dois-0001" }));
    await until(() => rides(a).length === 1 && rides(r).length === 1);
    const vehicle = rides(a)[0]!.args[0]!;
    expect(rides(r)[0]).toMatchObject({ args: [vehicle, 0], text: "taxi" });
    await until(() => rides(r).some((event) => event.args[1] === 1), 20_000);
    a.socket.send(encodeCorrida({ op: "subir" }));
    await until(() => a.me().vehicleId === vehicle);
    expect(a.me().seat).toBe(1);
    await pause(400);
    // Waiting for Rui: still at the kerb, and Ana still in it.
    expect(rides(a).some((event) => event.args[1] === 2)).toBe(false);
    expect(a.me().vehicleId).toBe(vehicle);
    r.socket.send(encodeCorrida({ op: "subir" }));
    await until(() => r.me().vehicleId === vehicle && rides(r).some((event) => event.args[1] === 2));
    expect(r.me().seat).toBe(2);
    // Carried together, set down together near where it was asked to go: and they have arrived.
    await until(() => rides(a).some((event) => event.text === "chegou") && rides(r).some((event) => event.text === "chegou"), 25_000);
    await until(() => a.me().vehicleId === null && r.me().vehicleId === null);
    expect(Math.hypot(a.me().x - 52_000, a.me().z - 90_000)).toBeLessThan(6000);
    expect(Math.hypot(r.me().x - 52_000, r.me().z - 90_000)).toBeLessThan(6000);
    expect(Math.hypot(r.me().x - a.me().x, r.me().z - a.me().z)).toBeGreaterThan(400);
    await until(() => said(a, "chegaram").length === 1 && said(r, "chegaram").length === 1, 6000);
    expect(said(r, "chegaram")[0]).toMatchObject({ subject: id(a), args: [3, 0] });

    // Rui ends it: both are told. Then Rui asks, Ana says no: Rui is told only that, and does not ask her again yet.
    r.socket.send(encodeSair({ op: "terminar" }));
    await until(() => said(a, "fim").length === 1 && said(r, "fim").length === 1);
    expect(said(a, "fim")[0]).toMatchObject({ subject: id(r), args: [4, SAIR_FINS.indexOf("terminou")] });
    r.socket.send(encodeSair({ op: "convidar", entidade: id(a), lugar: 0 }));
    await until(() => said(a, "convite").length === 2);
    a.socket.send(encodeSair({ op: "recusar", entidade: id(r) }));
    await until(() => said(r, "nao").length === 1);
    r.socket.send(encodeSair({ op: "convidar", entidade: id(a), lugar: 0 }));
    await until(() => refusals(r).length === 1);
    expect(refusals(r)).toEqual(["cedo"]);
    // The other way is open: Ana asks, Rui says yes, and Rui leaves the street: Ana is told it is over.
    a.socket.send(encodeSair({ op: "convidar", entidade: id(r), lugar: 1 }));
    await until(() => said(r, "convite").length === 2);
    r.socket.send(encodeSair({ op: "aceitar", entidade: id(a) }));
    await until(() => said(a, "combinado").length === 2);
    await r.leave();
    await until(() => said(a, "fim").length === 2);
    expect(said(a, "fim")[1]!.args).toEqual([4, SAIR_FINS.indexOf("saiu")]);
    await Promise.all([a.leave(), e.leave(), n.leave()]);
  }, 90_000);

  test("gestures for two (the founder, 2026-11-21): a handshake offered and taken is seen by both and by whoever watches, and is a meeting; a no says only no; a hug is between two adults; nothing from afar or unasked", async () => {
    const [ana, rui, ze] = [await player(), await player(), await player()];
    const [novo] = await sql<{ id: string }[]>`INSERT INTO players (age_band, name, name_key, bi_number) VALUES ('15_17', 'Novo Gesto', 'novo gesto', '97777777-LA') RETURNING id`;
    const novoToken = randomBytes(32).toString("base64url");
    await sql`INSERT INTO player_sessions (player_id, token_hash, expires_at) VALUES (${novo!.id}, ${hashToken(novoToken)}, now() + interval '1 day')`;
    const a = await phone(ana.token, PROTOCOL_VERSION, "conversa");
    const r = await phone(rui.token, PROTOCOL_VERSION, "conversa");
    const n = await phone(novoToken, PROTOCOL_VERSION, "conversa");
    const far = await phone(ze.token, PROTOCOL_VERSION, "conversa-30");
    const said = (who: typeof a, what: (typeof A_DOIS_DITOS)[number]): WorldEvent[] => who.state.events.filter((event) => event.kind === EVENT.A_DOIS && event.args[0] === A_DOIS_DITOS.indexOf(what));
    const id = (who: typeof a): number => who.state.accepted!.entityId;
    // A yes to nothing is nothing.
    r.socket.send(encodeADois({ op: "aceitar", entidade: id(a) }));
    await until(() => said(r, "nao_pode").length === 1);
    // Ana holds out her hand to Rui: he is asked, and nobody else is told anything yet.
    a.socket.send(encodeADois({ op: "oferecer", entidade: id(r), gesto: 0 }));
    await until(() => said(r, "pedido").length === 1);
    expect(said(r, "pedido")[0]).toMatchObject({ subject: id(a), args: [0, 0] });
    expect([said(a, "feito"), said(n, "feito")].map((list) => list.length)).toEqual([0, 0]);
    // He takes it: both, and the one standing by, are told; and the two have met.
    r.socket.send(encodeADois({ op: "aceitar", entidade: id(a) }));
    await until(() => said(a, "feito").length === 1 && said(r, "feito").length === 1 && said(n, "feito").length === 1);
    expect(said(n, "feito")[0]).toMatchObject({ subject: id(a), args: [3, id(r), 0] });
    await until(() => a.state.events.some((event) => event.kind === EVENT.MET && event.subject === id(r)));
    // The same yes again takes nothing: the offer was used.
    r.socket.send(encodeADois({ op: "aceitar", entidade: id(a) }));
    await until(() => said(r, "nao_pode").length === 2);
    // A hug between two adults, declined: only "not now" comes back.
    await pause(1100);
    r.socket.send(encodeADois({ op: "oferecer", entidade: id(a), gesto: 1 }));
    await until(() => said(a, "pedido").length === 1);
    expect(said(a, "pedido")[0]!.args).toEqual([0, 1]);
    a.socket.send(encodeADois({ op: "recusar", entidade: id(r) }));
    await until(() => said(r, "nao").length === 1);
    expect(said(a, "feito")).toHaveLength(1);
    // Never a hug with someone under 18, whoever offers; a handshake with them is a handshake.
    await pause(1100);
    a.socket.send(encodeADois({ op: "oferecer", entidade: id(n), gesto: 1 }));
    n.socket.send(encodeADois({ op: "oferecer", entidade: id(a), gesto: 1 }));
    await until(() => said(a, "nao_pode").length === 1 && said(n, "nao_pode").length === 1);
    expect(said(n, "pedido")).toEqual([]);
    await pause(1100);
    n.socket.send(encodeADois({ op: "oferecer", entidade: id(a), gesto: 0 }));
    await until(() => said(a, "pedido").length === 2);
    // And not from thirty metres off.
    far.socket.send(encodeADois({ op: "oferecer", entidade: id(a), gesto: 0 }));
    await until(() => said(far, "nao_pode").length === 1);
    expect(said(a, "pedido")).toHaveLength(2);
    await Promise.all([a.leave(), r.leave(), n.leave(), far.leave()]);
  }, 30_000);

  test("the ball of a campo (2026-11-21): whoever comes near is told where it lies; walked into, it is kicked the way they go, and everyone near is told; far off, nobody hears of it", async () => {
    const [one, other, away] = [await player(), await player(), await player()];
    const p = await phone(one.token, PROTOCOL_VERSION, "campo");
    const watcher = await phone(other.token, PROTOCOL_VERSION, "campo-lado");
    const far = await phone(away.token, PROTOCOL_VERSION, "conversa");
    const balls = (who: typeof p): WorldEvent[] => who.state.events.filter((event) => event.kind === EVENT.BOLA);
    await until(() => balls(p).length >= 1 && balls(watcher).length >= 1);
    // In the middle, still.
    expect(balls(p)[0]).toMatchObject({ subject: 0 });
    expect(balls(p)[0]!.args.slice(0, 4)).toEqual([78_000, -83_000, 0, 0]);
    // Walked into from the west: it goes east, faster than a walk, and both are told.
    const told = balls(watcher).length;
    await p.walk(90, east);
    await until(() => balls(watcher).length > told && balls(p).some((event) => event.args[2]! > 0));
    const kick = balls(p).find((event) => event.args[2]! > 0)!;
    expect(kick.args[2]).toBeGreaterThan(2600);
    expect(Math.abs(kick.args[3]!)).toBeLessThan(kick.args[2]!);
    // Both stand on the pitch: each is on a side, one of each, and both are told of both (D-11.11).
    const sides = (who: typeof p): Map<number, number> => new Map(who.state.events.filter((event) => event.kind === EVENT.LADO).map((event) => [event.subject, event.args[1]!]));
    await until(() => sides(p).size === 2 && sides(watcher).size === 2);
    expect([...sides(p).values()].sort()).toEqual([1, 2]);
    expect(sides(watcher)).toEqual(sides(p));
    expect(balls(far).length + sides(far).size).toBe(0);
    // Someone on the other side of the bairro never hears of this ball.
    expect(balls(far)).toEqual([]);
    await Promise.all([p.leave(), watcher.leave(), far.leave()]);
  }, 30_000);

  test("whoever stands at a way out to another bairro is said to be there, with where it leads and where one arrives; nobody else is (Task 11.2)", async () => {
    const [one, other] = [await player(), await player()];
    const p = await phone(one.token, PROTOCOL_VERSION, "mutamba");
    const far = await phone(other.token, PROTOCOL_VERSION, "conversa");
    let said: string | null = null;
    await until(() => {
      void presence.marked(one.id, "porta").then((value) => void (said = value));
      return said !== null;
    }, 5000);
    expect(said).toBe("para-fora|ao-lua/outro|chegada;para-longe|ao-lua/longe|largo");
    expect(await presence.marked(other.id, "porta")).toBeNull();
    // And whoever stands at a barbearia is said to be there (D-11.10); nobody else is.
    let where: string | null = null;
    await until(() => {
      void presence.marked(other.id, "servico").then((value) => void (where = value));
      return where !== null;
    }, 5000);
    expect(where).toBe("corte");
    expect(await presence.marked(one.id, "servico")).toBeNull();
    await p.leave();
    await far.leave();
  });

  test("a ride that cannot be given (no road near where it was asked to go), and one called off before getting on: the fare is given back on the zone's note", async () => {
    const one = await player();
    const p = await phone(one.token, PROTOCOL_VERSION, "moto");
    const refused = (): WorldEvent[] => p.state.events.filter((event) => event.kind === EVENT.CORRIDA_RECUSADA);
    await presence.mark(one.id, "corrida", "corrida-teste-02:taxi:-90000:-90000", 120);
    p.socket.send(encodeCorrida({ op: "pedir", id: "corrida-teste-02" }));
    await until(() => refused().length === 1);
    expect(refused()[0]!.text).toBe("sem_estrada");
    expect(await presence.marked(one.id, "corrida-devolver")).toBe("corrida-teste-02");
    await presence.mark(one.id, "corrida", "corrida-teste-03:kupapata:52000:90000", 120);
    p.socket.send(encodeCorrida({ op: "pedir", id: "corrida-teste-03" }));
    await until(() => p.state.events.some((event) => event.kind === EVENT.CORRIDA));
    p.socket.send(encodeCorrida({ op: "descer" }));
    await until(() => refused().length === 2);
    expect(refused()[1]!.text).toBe("cancelada");
    expect(await presence.marked(one.id, "corrida-devolver")).toBe("corrida-teste-03");
    await p.leave();
  });

  test("Energia at zero (Task 4.4): taken to the hospital (the door, in a district without one), back on their feet with Energia and some Fome, and a note left for the bill", async () => {
    const one = await player();
    await sql`UPDATE players SET fome = 1000, energia = 1 WHERE id = ${one.id}`;
    const p = await phone(one.token, PROTOCOL_VERSION, "mutamba");
    expect(Math.hypot(p.me().x - 40_000, p.me().z + 20_000)).toBeLessThan(3500);
    const woke = (): WorldEvent | undefined => p.state.events.find((event) => event.kind === EVENT.HOSPITAL);
    // Time takes the last of it at the next tending, within five seconds.
    await until(() => woke() !== undefined, 12_000);
    const stay = woke()!.text;
    expect(stay).toMatch(/^[0-9a-z]+$/);
    // At the district's door: this one has no hospital among its places.
    await until(() => Math.hypot(p.me().x, p.me().z) < 2000);
    // Told at once: Energia back to 6 000, Fome raised to 5 000, not tired.
    const after = p.state.events.filter((event) => event.kind === EVENT.NECESSIDADES).at(-1)!;
    expect(after.args).toEqual([5000, 6000, 0]);
    // The API's note, by which it asks the bill once.
    expect(await presence.marked(one.id, "hospital")).toBe(stay);
    let kept: { fome: number; energia: number } | undefined;
    for (let n = 0; n < 40 && !(kept && kept.energia === 6000); n++) {
      [kept] = await sql<{ fome: number; energia: number }[]>`SELECT fome, energia FROM players WHERE id = ${one.id}`;
      await pause(50);
    }
    expect(kept).toEqual({ fome: 5000, energia: 6000 });
    // Once only: the next tending finds Energia, not a second stay.
    await pause(5500);
    expect(p.state.events.filter((event) => event.kind === EVENT.HOSPITAL)).toHaveLength(1);
    await p.leave();
  }, 30_000);

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
    const first = await player();
    const one = await phone(await seat(first.id, 2));
    await until(() => false, 150).catch(() => {});
    const cards = await presence.zones();
    const mine = cards.find((card) => card.id === zone.id)!;
    expect(mine.address).toBe("");
    expect(mine.rooms.map((room) => room.name).sort()).toEqual(["ao-lua.l1", "zz-dev.d1"]);
    // With who is there and how its steps are going, for the Estúdio.
    const [channel] = mine.rooms.find((room) => room.name === "ao-lua.l1")!.channels;
    expect(channel).toMatchObject({ number: 2, players: 1, who: [first.id] });
    expect(channel!.worstMs).toBeGreaterThanOrEqual(channel!.meanMs!);
    expect(channel!.worstMs).toBeLessThan(50);
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
    // A second zone of its own, started and closed, with the gate loading the machine: more than fifteen seconds now and then (F-176).
  }, 30_000);
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

  test("which of the district's places a player stands at, and whom they have met, are said where the API can read them (os recados do dia)", async () => {
    const here = await player();
    const there = await player();
    const other = await player();
    const a = await phone(here.token);
    const b = await phone(there.token, PROTOCOL_VERSION, "conversa");
    const c = await phone(other.token, PROTOCOL_VERSION, "conversa");
    let at: string | null = null;
    await until(() => {
      void presence.marked(here.id, "lugar").then((what) => void (at = what));
      return at !== null;
    });
    // The first of two places; the other two stand at the second.
    expect(at).toBe("0/2");
    let atThere: string | null = null;
    await until(() => {
      void presence.marked(there.id, "lugar").then((what) => void (atThere = what));
      return atThere !== null;
    });
    expect(atThere).toBe("1/2");
    // The two at the second place wave to each other: each is said to have met the other, for a good while.
    send(b, encodeEmote({ emote: 0 }));
    await pause(200);
    send(c, encodeEmote({ emote: 0 }));
    let met: string | null = null;
    await until(() => {
      void presence.marked(there.id, "conheceu").then((what) => void (met = what));
      return met !== null;
    });
    expect(met).toBe(other.id);
    expect(await presence.marked(other.id, "conheceu")).toBe(there.id);
    expect(await presence.marked(here.id, "conheceu")).toBeNull();
    for (const one of [a, b, c]) await one.leave();
  });

  test("a wave answered by a wave, close by, is a meeting: both are told, once; a wave from afar or one never answered is only a wave", async () => {
    const a = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    const b = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    const far = await phone((await player()).token, PROTOCOL_VERSION, "conversa-10");
    const met = (who: typeof a): number[] => who.state.events.filter((event) => event.kind === EVENT.MET).map((event) => event.subject);
    // One waves, and nobody answers: nobody has met anybody.
    send(a, encodeEmote({ emote: 0 }));
    await pause(300);
    expect([met(a), met(b), met(far)]).toEqual([[], [], []]);
    // Ten metres off is too far to be a greeting, though the wave is seen.
    send(far, encodeEmote({ emote: 0 }));
    await pause(300);
    expect([met(a), met(far)]).toEqual([[], []]);
    // The other waves back: they have met, each told who.
    send(b, encodeEmote({ emote: 0 }));
    await until(() => met(a).length === 1 && met(b).length === 1);
    expect(met(a)).toEqual([b.state.accepted!.entityId]);
    expect(met(b)).toEqual([a.state.accepted!.entityId]);
    // Another gesture is not a greeting, and waving again does not meet them twice.
    await pause(1100);
    send(a, encodeEmote({ emote: 4 }));
    await pause(1100);
    send(a, encodeEmote({ emote: 0 }));
    send(b, encodeEmote({ emote: 0 }));
    await pause(400);
    expect([met(a).length, met(b).length, met(far).length]).toEqual([1, 1, 0]);
    for (const one of [a, b, far]) await one.leave();
  });

  test("a greeting in words is a greeting: \"Bom dia\" answered by \"Tudo bem?\", or by a wave, is a meeting; other talk is not", async () => {
    const a = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    const b = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    const c = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    const met = (who: typeof a): number[] => who.state.events.filter((event) => event.kind === EVENT.MET).map((event) => event.subject).sort();
    const ids = [a, b, c].map((one) => one.state.accepted!.entityId);
    // Talk that greets nobody meets nobody.
    send(a, encodeChatSend({ messageId: 1, text: "onde fica a paragem" }));
    send(b, encodeChatSend({ messageId: 1, text: "ali à frente" }));
    await pause(400);
    expect([met(a), met(b), met(c)]).toEqual([[], [], []]);
    // "Bom dia!" from one, "Tudo bem?" from another: those two have met; the third, who said nothing, has not.
    await pause(LINE_GAP_MS);
    send(a, encodeChatSend({ messageId: 2, text: "Bom dia!" }));
    await pause(LINE_GAP_MS + 100);
    send(b, encodeChatSend({ messageId: 2, text: "tudo bem?" }));
    await until(() => met(a).length === 1 && met(b).length === 1);
    expect([met(a), met(b), met(c)]).toEqual([[ids[1]], [ids[0]], []]);
    // The third answers with a wave: it is an answer to both greetings, which are still in the air.
    send(c, encodeEmote({ emote: 0 }));
    await until(() => met(c).length === 2);
    expect(met(c)).toEqual([ids[0], ids[1]].sort());
    for (const one of [a, b, c]) await one.leave();
  });

  test("a van is a room of its own: riders of the same van hear one another wherever it is, and the street does not hear them, nor they the street", async () => {
    const a = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    const b = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    const street = await phone((await player()).token, PROTOCOL_VERSION, "conversa");
    const ids = [a, b, street].map((one) => one.state.accepted!.entityId);
    // The test's district runs no traffic: the two are seated in a van by hand, as the room would on their asking.
    const room = zone.rooms();
    expect(room, "the zone lets a test reach its rooms").toBeDefined();
    room![0]!.channel.ride(ids[0]!, 3, 6);
    room![0]!.channel.ride(ids[1]!, 3, 2);
    send(a, encodeChatSend({ messageId: 1, text: "bora, motorista" }));
    await until(() => b.state.heard.length === 1);
    expect(b.state.heard[0]).toEqual({ from: ids[0], text: "bora, motorista" });
    await pause(300);
    expect(street.state.heard).toEqual([]);
    send(street, encodeChatSend({ messageId: 1, text: "ei, esperem" }));
    await pause(400);
    expect(a.state.heard.map((one) => one.text)).toEqual(["bora, motorista"]);
    for (const one of [a, b, street]) await one.leave();
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
      socket.onmessage = (event: MessageEvent) => {
        const message = decodeZoneMessage(new Uint8Array(event.data as ArrayBuffer));
        // What a newcomer is told of their own Fome and Energia is no talk (Task 4.4).
        if (message.type !== "event" || message.kind !== EVENT.NECESSIDADES) got.push(message.type);
      };
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
    // (They arrived beside the watcher, not on the very spot: how far they walk is counted from where they began.)
    const began = gone.me().z;
    await gone.walk(20, north);
    await until(() => gone.me().z > began + 800 && gone.me().anim === DOING.idle);
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

  test("whoever stands at a caixa is said to be there, within a second or so, and nobody else is: the API banks on the zone's word", async () => {
    const near = await player();
    const far = await player();
    const a = await phone(near.token);
    const b = await phone(far.token, PROTOCOL_VERSION, "conversa");
    let said: string | null = null;
    await until(() => {
      void presence.marked(near.id, "caixa").then((what) => void (said = what));
      return said !== null;
    });
    expect(await presence.marked(far.id, "caixa")).toBeNull();
    // And who stands with whom: two together are each said to be with the other; someone alone is with nobody.
    const beside = await player();
    const c = await phone(beside.token);
    let withNear: string | null = null;
    await until(() => {
      void presence.marked(near.id, "com").then((what) => void (withNear = what));
      return withNear !== null;
    });
    expect(withNear).toBe(beside.id);
    expect(await presence.marked(beside.id, "com")).toBe(near.id);
    expect(await presence.marked(far.id, "com")).toBeNull();
    await c.leave();
    await a.leave();
    await b.leave();
  });

  // What staff do in the Estúdio is carried out here (Task 3.8): the zone asks every few seconds.
  test("someone a moderator has silenced is heard by nobody and told so, from their first word or within seconds; unsilenced, they are heard again", async () => {
    const staffId = await putStaff(sql, { email: "mod@zona.test", name: "Mod", passwordHash: "x", roles: ["moderador"] });
    const speaker = await player();
    const already = await player();
    await sanction(sql, { playerId: already.id, kind: "mute", reason: "insultos", staffId, hours: 1 });
    const a = await phone(speaker.token, PROTOCOL_VERSION, "conversa");
    const b = await phone(already.token, PROTOCOL_VERSION, "conversa");
    // Silenced before coming in: silent from the first word.
    b.socket.send(encodeChatSend({ messageId: 1, text: "ouvem-me?" }));
    await until(() => b.state.events.some((event) => event.kind === EVENT.CHAT_REFUSED));
    expect(b.state.events.find((event) => event.kind === EVENT.CHAT_REFUSED)).toMatchObject({ subject: 1, args: [CHAT_REFUSAL.MUTED] });
    // Silenced while in the street: within a few seconds.
    a.socket.send(encodeChatSend({ messageId: 1, text: "antes" }));
    await until(() => b.state.heard.length === 1);
    const mute = await sanction(sql, { playerId: speaker.id, kind: "mute", reason: "insultos", staffId, hours: 1 });
    let n = 1;
    await until(() => {
      a.socket.send(encodeChatSend({ messageId: ++n, text: `depois ${n}` }));
      return a.state.events.some((event) => event.kind === EVENT.CHAT_REFUSED && event.args[0] === CHAT_REFUSAL.MUTED);
    }, 9000).catch(() => {});
    expect(a.state.events.some((event) => event.kind === EVENT.CHAT_REFUSED && event.args[0] === CHAT_REFUSAL.MUTED)).toBe(true);
    const heardWhileSilenced = b.state.heard.length;
    await pause(LINE_GAP_MS + 100);
    a.socket.send(encodeChatSend({ messageId: 500, text: "calado" }));
    await pause(300);
    expect(b.state.heard).toHaveLength(heardWhileSilenced);
    // They still walk and are still seen: silenced is not put out.
    expect(a.state.closed).toBeNull();
    // Lifted: heard again within seconds.
    expect(await liftSanction(sql, mute, staffId, "engano")).toBe(true);
    let m = 600;
    await until(() => {
      a.socket.send(encodeChatSend({ messageId: ++m, text: "de volta" }));
      return b.state.heard.some((line) => line.text === "de volta");
    }, 9000).catch(() => {});
    expect(b.state.heard.some((line) => line.text === "de volta")).toBe(true);
    await a.leave();
    await b.leave();
    // What a silenced player tried to say is kept, as not said.
    await pause(300);
    expect(await sql`SELECT 1 FROM chat_lines WHERE player_id = ${already.id} AND text = 'ouvem-me?' AND said = false`).toHaveLength(1);
  }, 40_000);

  test("someone suspended is put out of the street within seconds, on a line that says why it closed; someone kicked for being stuck comes back at the district's door", async () => {
    const staffId = await putStaff(sql, { email: "mod2@zona.test", name: "Mod Dois", passwordHash: "x", roles: ["moderador"] });
    const bad = await player();
    const stuck = await player();
    const watcher = await phone((await player()).token);
    const a = await phone(bad.token);
    const b = await phone(stuck.token);
    const aId = a.state.accepted!.entityId;
    await until(() => watcher.seen(aId) !== undefined);
    await b.walk(30, east);
    const walkedTo = b.me().x;
    expect(walkedTo).toBeGreaterThan(1000);
    await sanction(sql, { playerId: bad.id, kind: "suspend", reason: "ameaças", staffId, hours: 24 });
    await sanction(sql, { playerId: stuck.id, kind: "kick", reason: "preso numa parede", staffId });
    await until(() => a.state.closed !== null && b.state.closed !== null, 9000);
    expect(a.state.closed).toBe(ZONE_CLOSE.PUT_OUT);
    expect(b.state.closed).toBe(ZONE_CLOSE.PUT_OUT);
    // Gone from the street at once: no body is kept standing for someone put out.
    await until(() => watcher.seen(aId) === undefined);
    // The kicked player comes in again, at the door and not where they were; and is not put out a second time by the same kick.
    const back = await phone(stuck.token);
    expect(Math.abs(back.me().x)).toBeLessThan(walkedTo / 2);
    await pause(6000);
    expect(back.state.closed).toBeNull();
    await back.leave();
    await watcher.leave();
  }, 40_000);

  test("and through all of it the zone had nothing to complain of", () => {
    expect(said).toEqual([]);
  });
});

describe("the family's house (Phase 5, D-5.8 to D-5.10)", () => {
  test("someone who has not slept at home wakes in a public place of the bairro, not in their house; at their door, it is shut, and a wall to them too until their own hand opens it; a stranger meets a wall whatever the door does; two families given the same house each have an inside of their own; from inside the street is seen, and the street does not see in; whoever went to sleep at home wakes where they lay", async () => {
    const [mae, vizinha, estranho] = [await player(), await player(), await player()];
    await sql`INSERT INTO family_homes (player_id, district_id, house, kind) VALUES (${mae.id}, 'ao-lua/l1', 1, 'casa'), (${vizinha.id}, 'ao-lua/l1', 1, 'casa')`;
    // Never having stood here, she wakes where the bairro's people arrive: far from her house, among whoever is there.
    const first = await phone(mae.token);
    expect(Math.hypot(first.me().x, first.me().z)).toBeLessThan(4000);
    await first.leave();
    // (The tests' zone sets someone down before their own door when asked: the walk home is the browser's to test.)
    const a = await phone(mae.token, PROTOCOL_VERSION, "casa");
    const b = await phone(vizinha.token, PROTOCOL_VERSION, "casa");
    const c = await phone(estranho.token, PROTOCOL_VERSION, "casa");
    const [aId, bId, cId] = [a.state.accepted!.entityId, b.state.accepted!.entityId, c.state.accepted!.entityId];
    const south: InputFrame = { dx: 0, dz: -127, run: false, brake: false };
    const doors = (of: typeof a) => of.state.events.filter((event) => event.kind === EVENT.PORTA).map((event) => [event.subject, ...event.args]);
    const inTo = async (of: typeof a): Promise<void> => {
      // To the middle of the doorway first (it is a metre wide), then in.
      for (let n = 0; n < 60 && Math.abs(of.me().x + 82_500) > 150; n++) await of.walk(2, { dx: of.me().x > -82_500 ? -127 : 127, dz: 0, run: false, brake: false });
      for (let n = 0; n < 80 && of.me().z > -81_300; n++) await of.walk(2, south);
    };
    expect(a.me().z).toBeGreaterThan(-80_000);
    // The door is shut: its own family walks into it, as the stranger does. He cannot open it.
    await Promise.all([a.walk(45, south), c.walk(45, south)]);
    expect(a.me().z).toBeGreaterThan(-80_000);
    expect(c.me().z).toBeGreaterThan(-80_000);
    c.socket.send(encodePorta(true));
    await pause(200);
    expect(doors(a)).toEqual([]);
    // Her hand opens it: everyone here is told whose hand it was. She and her neighbour of the same house walk in,
    // each into her own inside: neither sees the other. The stranger still meets a wall, and sees nobody in it;
    // both of them see him through the open door.
    a.socket.send(encodePorta(true));
    await until(() => doors(c).length === 1);
    expect(doors(c)).toEqual([[aId, 1, 1]]);
    await inTo(a);
    await inTo(b);
    await c.walk(30, south);
    await until(() => a.me().z < -81_000 && b.me().z < -81_000 && c.seen(aId) === undefined && c.seen(bId) === undefined && a.seen(bId) === undefined && b.seen(aId) === undefined);
    expect(c.me().z).toBeGreaterThan(-80_000);
    expect(a.seen(cId)).toBeDefined();
    expect(b.seen(cId)).toBeDefined();
    // Someone who comes into the street now is told the door stands open, as it was left.
    const d = await phone((await player()).token, PROTOCOL_VERSION, "casa");
    expect(doors(d)).toEqual([[0, 1, 1]]);
    await d.leave();
    // She shuts it behind her, and the doorway is a wall again, to her too.
    a.socket.send(encodePorta(false));
    await until(() => doors(c).length === 2);
    expect(doors(c)[1]).toEqual([aId, 1, 0]);
    await a.walk(50);
    expect(a.me().z).toBeLessThan(-80_500);
    // A place to lie (D-5.12): the esteira the house came with is the first seat past the bairro's own bench. She
    // lies on it, where it is; the stranger, who asks for the same seat from the street, is not let onto it; and
    // up again she stands in her house, not put out of it.
    a.socket.send(encodeBanco({ seat: 1, sim: true }));
    await until(() => a.me().anim === DOING.sit);
    expect(a.me()).toMatchObject({ x: -81_500, z: -81_500 });
    c.socket.send(encodeBanco({ seat: 1, sim: true }));
    await pause(250);
    expect(c.me().anim).not.toBe(DOING.sit);
    a.socket.send(encodeBanco({ seat: 1, sim: false }));
    await until(() => a.me().anim !== DOING.sit);
    expect(a.me().z).toBeLessThan(-80_500);
    expect(a.me().x).toBeGreaterThan(-84_500);
    // Things in the house (Task 5.3). She carries a chair and a mattress home in her Mochila; the list is said whole each time.
    await sql`INSERT INTO items (owner_id, place, item, quantity) VALUES (${mae.id}, 'mochila', 'cadeira', 1), (${mae.id}, 'mochila', 'colchao', 1)`;
    const said = (of: typeof a) => {
      const events = of.state.events.filter((event) => event.kind === EVENT.MOVEIS);
      const last = events.at(-1)!;
      const count = last.args[4]!;
      return { why: MOVEL_RECUSAS[last.args[5]!], things: events.slice(events.length - Math.max(1, count)).filter(() => count > 0).map((event) => [event.text, event.args[0], event.args[1], event.args[2]]) };
    };
    const asks = async (of: typeof a, movel: Parameters<typeof encodeMovel>[0]): Promise<ReturnType<typeof said>> => {
      const before = of.state.events.length;
      of.socket.send(encodeMovel(movel));
      await until(() => of.state.events.length > before && of.state.events.at(-1)!.kind === EVENT.MOVEIS && (of.state.events.at(-1)!.args[4] === 0 || of.state.events.at(-1)!.args[3] === of.state.events.at(-1)!.args[4]! - 1));
      return said(of);
    };
    const idOf = (item: string): number => a.state.events.filter((event) => event.kind === EVENT.MOVEIS && event.text === item).at(-1)!.subject;
    // Into a wall, into the doorway, or where she stands herself: it cannot stand there, and stays in the Mochila.
    expect(await asks(a, { op: "por", id: 0, item: "cadeira", cx: -5, cz: 0, rot: 0 })).toEqual({ why: "lugar", things: [] });
    expect(await asks(a, { op: "por", id: 0, item: "cadeira", cx: 0, cz: 4, rot: 0 })).toEqual({ why: "lugar", things: [] });
    const feet = [Math.floor((a.me().x + 82_500) / 500), Math.floor((a.me().z + 82_500) / 500)] as const;
    expect(await asks(a, { op: "por", id: 0, item: "cadeira", cx: feet[0], cz: feet[1], rot: 0 })).toEqual({ why: "lugar", things: [] });
    // On the floor: it is there, and out of the Mochila. What she does not carry is not set down.
    expect(await asks(a, { op: "por", id: 0, item: "cadeira", cx: -4, cz: -4, rot: 0 })).toEqual({ why: "", things: [["cadeira", -4, -4, 0]] });
    expect(await asks(a, { op: "por", id: 0, item: "cadeira", cx: 2, cz: -4, rot: 0 })).toMatchObject({ why: "nao_tens" });
    expect((await sql`SELECT item FROM items WHERE owner_id = ${mae.id} AND place = 'mochila' ORDER BY item`).map((row) => row.item)).toEqual(["colchao"]);
    // The mattress (a metre by two) does not go on the chair; beside it, it does; turned a quarter where it would then reach into the wall, it does not.
    expect(await asks(a, { op: "por", id: 0, item: "colchao", cx: -4, cz: -4, rot: 0 })).toMatchObject({ why: "lugar" });
    expect(await asks(a, { op: "por", id: 0, item: "colchao", cx: 2, cz: -4, rot: 0 })).toEqual({ why: "", things: [["cadeira", -4, -4, 0], ["colchao", 2, -4, 0]] });
    expect(await asks(a, { op: "mudar", id: idOf("colchao"), item: "colchao", cx: 2, cz: -4, rot: 1 })).toMatchObject({ why: "lugar" });
    expect(await asks(a, { op: "mudar", id: idOf("colchao"), item: "colchao", cx: -2, cz: -4, rot: 1 })).toEqual({ why: "", things: [["cadeira", -4, -4, 0], ["colchao", -2, -4, 1]] });
    // Where a thing stands, she does not walk: the chair is in the far corner, and she walks into it and stops.
    // Her neighbour of the same house has an inside of her own, with nothing in it: she is told of none of this.
    expect(b.state.events.filter((event) => event.kind === EVENT.MOVEIS && event.args[4]! > 0)).toEqual([]);
    // Someone outside their own house sets nothing down, in it or anywhere.
    await sql`INSERT INTO items (owner_id, place, item, quantity) VALUES (${estranho.id}, 'mochila', 'cadeira', 1)`;
    expect(await asks(c, { op: "por", id: 0, item: "cadeira", cx: 0, cz: 0, rot: 0 })).toEqual({ why: "fora", things: [] });
    // Taken up again, it is in the Mochila; a thing that is not there cannot be taken.
    const chair = idOf("cadeira");
    expect(await asks(a, { op: "guardar", id: chair, item: "cadeira", cx: 0, cz: 0, rot: 0 })).toEqual({ why: "", things: [["colchao", -2, -4, 1]] });
    expect(await asks(a, { op: "guardar", id: chair, item: "cadeira", cx: 0, cz: 0, rot: 0 })).toMatchObject({ why: "foi" });
    expect((await sql`SELECT item FROM items WHERE owner_id = ${mae.id} AND place = 'mochila' ORDER BY item`).map((row) => row.item)).toEqual(["cadeira"]);
    // She says goodnight inside, and wakes where she lay: not in a public place this time, and not put out into the street.
    const lay = { x: a.me().x, z: a.me().z };
    await pause(5200);
    await a.leave();
    await pause(300);
    const again = await phone(mae.token);
    expect(Math.hypot(again.me().x - lay.x, again.me().z - lay.z)).toBeLessThan(600);
    expect(again.me().z).toBeLessThan(-80_200);
    // And what she set down is where she left it: said as she comes in.
    await until(() => again.state.events.some((event) => event.kind === EVENT.MOVEIS));
    expect(said(again).things).toEqual([["colchao", -2, -4, 1]]);
    await Promise.all([again.leave(), b.leave(), c.leave()]);
  }, 70_000);
});
