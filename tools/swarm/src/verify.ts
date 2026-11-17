// pnpm verify:phase3
//
// What Task 3.9 asks to be shown, with real processes and real sockets:
//
//   1. A second channel opens at 60: the matchmaker fills the first copy of a
//      bairro to its comfortable number and only then opens another.
//   2. A channel holds 80 inside the budgets: one client's download on foot
//      and the zone's step time (docs/BUDGETS.md).
//   3. A killed zone loses no player for more than 60 seconds: the process is
//      killed outright, another starts, and every player is back where they
//      stood without being asked anything.
//
// It starts its own zones (zone-child.ts) under its own keys in Redis and runs
// the API in this process, so a developer's `pnpm dev` is neither needed nor
// disturbed. It needs PostgreSQL and Redis (`pnpm services`) and the pack of
// the open district (`pnpm pack:l1`). What it cannot show is a real phone in
// that channel: that is the founder's hand, and the phase's document says so.

import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { connect, loadWorldSeed, parseKeyring, parsePepper } from "@nzila/db";
import { BASE_TUNABLES } from "@nzila/economy";
import { redisPresence, redisUrl } from "@nzila/presence";
import { PROTOCOL_VERSION, decodeSnapshot, decodeZoneMessage, encodeInput, encodeJoin, type InputFrame, type Snapshot } from "@nzila/protocol";
import { buildApp } from "../../../apps/api/src/app.ts";
import { runSwarm } from "./bots.ts";
import { BUDGET } from "./budget.ts";
import { makeGuests } from "./guests.ts";

const PREFIX = `nzila-verify-${process.pid}`;
const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
const say = (line: string): void => console.log(line);
const failures: string[] = [];
const check = (ok: boolean, what: string): void => {
  say(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) failures.push(what);
};

const district = (await loadWorldSeed()).districts.find((one) => one.open);
if (!district) throw new Error("verify: the registry has no open district");
const room = district.id.replaceAll("/", ".");
const { fillTo, cap } = BASE_TUNABLES.channels;

const sql = connect(undefined, 10);
const presence = await redisPresence(redisUrl(), PREFIX);
const app = buildApp({ sql, presence, pepper: parsePepper(process.env.HASH_PEPPER), keyring: parseKeyring(process.env.FIELD_KEYS), limiter: { allow: () => true } });

const children: ChildProcess[] = [];
function startZone(port: number): ChildProcess {
  const child = spawn(process.execPath, [fileURLToPath(new URL("./zone-child.ts", import.meta.url))], { env: { ...process.env, ZONE_PORT: String(port), VERIFY_PREFIX: PREFIX }, stdio: ["ignore", "ignore", "inherit"] });
  children.push(child);
  return child;
}
async function zoneUp(count: number, withinMs = 30_000): Promise<number> {
  const began = Date.now();
  while (Date.now() - began < withinMs) {
    if ((await presence.zones()).length >= count) return Date.now() - began;
    await pause(100);
  }
  throw new Error("verify: the zone did not announce itself");
}
/** Where the matchmaker sends a player: the seat and the address, or the word of why not. */
async function seatFor(token: string, channel?: number): Promise<{ address: string; seat: string; channel: number } | { error: string }> {
  const answer = await app.inject({ method: "POST", url: "/v1/play/join", headers: { authorization: `Bearer ${token}` }, payload: { districtId: district!.id, ...(channel ? { channel } : {}) } });
  return answer.json();
}
const channelsNow = async (): Promise<Map<number, number>> => new Map((await presence.zones()).flatMap((zone) => zone.rooms.filter((one) => one.name === room).flatMap((one) => one.channels.map((channel) => [channel.number, channel.players] as const))));

const guests = await makeGuests(sql, cap + 2 + 12);
try {
  // ---------------------------------------------------------------- 1 and 2
  say(`verify: ${district.id}; a channel is filled to ${fillTo} and holds ${cap}`);
  startZone(2591);
  await zoneUp(1);
  const sent: number[] = [];
  let health = { meanMs: 0, worstMs: 0 };
  const report = await runSwarm({
    url: `ws://127.0.0.1:2591/${room}`,
    // The first sixty-one come as anyone does. The rest are sent to the first channel by name (the tool of
    // development that goes past "comfortably full"), to fill it to all it holds.
    tokens: guests.tokens.slice(0, cap + 1).map((token, n) => async () => {
      const told = await seatFor(token, n > fillTo ? 1 : undefined);
      if ("error" in told) return null;
      sent.push(told.channel);
      return told.seat;
    }),
    oneByOne: true,
    seconds: 30,
    whileFull: async () => {
      // The zone's own account of its steps since the count began, with everyone in: its /health, less what it had
      // done before the channel was full.
      const said = (await (await fetch("http://127.0.0.1:2591/health")).json()) as { rooms: { name: string; channel: number; steps: number; meanMs: number; worstMs: number }[] };
      const now1 = said.rooms.find((one) => one.name === room && one.channel === 1);
      health = { meanMs: now1 ? now1.meanMs : 0, worstMs: now1 ? now1.worstMs : 0 };
      const now = await channelsNow();
      say("1. A second channel opens at sixty");
      check(sent.slice(0, fillTo).every((channel) => channel === 1), `the first ${fillTo} players were all put in channel 1`);
      check(sent[fillTo] === 2, `player ${fillTo + 1} was put in channel 2 (was sent to ${sent[fillTo]})`);
      check(now.get(1) === cap && now.get(2) === 1, `the zone says channel 1 holds ${cap} and channel 2 holds 1 (it says ${[...now].map(([number, players]) => `${number}: ${players}`).join(", ")})`);
      const over = await seatFor(guests.tokens[cap + 1]!, 1);
      check("error" in over && over.error === "full", `player ${cap + 2}, sent to channel 1 by name, is told it is full`);
    },
  });
  say(`2. ${cap} in one channel hold the budgets (thirty seconds, everyone walking)`);
  check(report.joined === cap + 1 && report.stayed === cap + 1, `all ${cap + 1} were let in and were still in at the end (${report.joined} in, ${report.stayed} stayed)`);
  check(report.downBytesPerSecond.worst <= BUDGET.downBytesPerSecond, `down per client: ${report.downBytesPerSecond.mean.toFixed(0)} B/s on the mean, ${report.downBytesPerSecond.worst.toFixed(0)} B/s the most (budget ${BUDGET.downBytesPerSecond})`);
  check(health.meanMs > 0 && health.meanMs <= BUDGET.stepMeanMs && health.worstMs <= BUDGET.stepWorstMs, `a step of channel 1: ${health.meanMs.toFixed(2)} ms on the mean, ${health.worstMs.toFixed(2)} ms at the worst (budget ${BUDGET.stepMeanMs} and ${BUDGET.stepWorstMs})`);
  say(`     seen by each: ${report.seen.mean.toFixed(1)} others on the mean, ${report.seen.most} at the most; ${report.snapshotsPerSecond.toFixed(1)} snapshots a second; largest message ${report.largestMessage} B`);

  // ---------------------------------------------------------------- 3
  say("3. A killed zone loses nobody for more than sixty seconds");
  await pause(1500);
  interface Phone {
    token: string;
    socket: WebSocket | null;
    had: Map<number, Snapshot>;
    entity: number;
    at: { x: number; z: number } | null;
    seq: number;
    ack: number;
    walking: boolean;
    back: number | null;
    cameBackAt: { x: number; z: number } | null;
    tries: number;
  }
  let killedAt = 0;
  const east: InputFrame = { dx: 127, dz: 0, run: false, brake: false };
  const still: InputFrame = { dx: 0, dz: 0, run: false, brake: false };
  /** A phone's line, as the game opens it: the matchmaker, then the zone; and again, on its own, when the line falls. */
  const open = async (phone: Phone): Promise<void> => {
    phone.tries++;
    const told = await seatFor(phone.token);
    if ("error" in told) return void setTimeout(() => void open(phone), 1000);
    const socket = new WebSocket(`${told.address}/${room}`);
    socket.binaryType = "arraybuffer";
    phone.had = new Map();
    socket.onopen = () => socket.send(encodeJoin({ protocolVersion: PROTOCOL_VERSION, token: told.seat }));
    socket.onerror = () => {};
    socket.onmessage = (event: MessageEvent) => {
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      const message = decodeZoneMessage(bytes);
      if (message.type === "join_accepted") {
        phone.socket = socket;
        phone.entity = message.entityId;
      }
      if (message.type !== "snapshot") return;
      const snapshot = decodeSnapshot(bytes, (tick) => phone.had.get(tick));
      phone.had.set(snapshot.tick, snapshot);
      phone.ack = snapshot.tick;
      if (phone.had.size > 32) phone.had.delete(phone.had.keys().next().value!);
      const me = snapshot.entities.find((one) => one.id === phone.entity);
      if (!me) return;
      phone.at = { x: me.x / 1000, z: me.z / 1000 };
      if (killedAt && phone.back === null) {
        phone.back = Date.now() - killedAt;
        phone.cameBackAt = phone.at;
      }
    };
    socket.onclose = () => {
      if (phone.socket === socket) phone.socket = null;
      if (!stopping) setTimeout(() => void open(phone), 1000);
    };
  };
  let stopping = false;
  const phones: Phone[] = guests.tokens.slice(cap + 2).map((token) => ({ token, socket: null, had: new Map(), entity: 0, at: null, seq: 0, ack: 0, walking: true, back: null, cameBackAt: null, tries: 0 }));
  for (const phone of phones) await open(phone);
  const sticks = setInterval(() => {
    for (const phone of phones) {
      if (!phone.socket || phone.socket.readyState !== 1) continue;
      phone.seq++;
      const frame = phone.walking ? east : still;
      phone.socket.send(encodeInput({ seq: phone.seq, ackTick: phone.ack, frames: [frame, frame, frame] }));
    }
  }, 50);
  const everyone = async (what: (phone: Phone) => boolean, withinMs: number): Promise<boolean> => {
    const end = Date.now() + withinMs;
    while (Date.now() < end) {
      if (phones.every(what)) return true;
      await pause(100);
    }
    return false;
  };
  check(await everyone((phone) => phone.socket !== null && phone.at !== null, 15_000), `${phones.length} players are in the street`);
  // They walk for four seconds, then stand for seven: where they stand has been written down (the zone notes it every five).
  await pause(4000);
  for (const phone of phones) phone.walking = false;
  await pause(7000);
  const stood = phones.map((phone) => ({ ...phone.at! }));
  const first = children[0]!;
  killedAt = Date.now();
  first.kill("SIGKILL");
  for (const phone of phones) phone.at = null;
  // Whoever watches the zones starts another: here, at once. How long a new one takes to be ready is part of what is measured.
  startZone(2592);
  const allBack = await everyone((phone) => phone.back !== null, 60_000);
  const times = phones.map((phone) => phone.back ?? Infinity);
  check(allBack, `all ${phones.length} are back in the street without being asked anything: the first after ${(Math.min(...times) / 1000).toFixed(1)} s, the last after ${(Math.max(...times) / 1000).toFixed(1)} s (budget 60)`);
  const moved = phones.map((phone, n) => (phone.cameBackAt ? Math.hypot(phone.cameBackAt.x - stood[n]!.x, phone.cameBackAt.z - stood[n]!.z) : Infinity));
  check(Math.max(...moved) < 2, `each came back where they stood: the farthest ${Math.max(...moved).toFixed(2)} m from their place`);
  check(new Set(phones.map((phone) => phone.entity)).size === phones.length, "and each is a body of their own in the new zone");
  say(`     tries by a phone to get back: ${Math.max(...phones.map((phone) => phone.tries)) - 1} at the most`);
  stopping = true;
  clearInterval(sticks);
  for (const phone of phones) phone.socket?.close(1000);
  await pause(500);
} finally {
  for (const child of children) child.kill("SIGKILL");
  await guests.remove();
  await app.close();
  await presence.close();
  await sql.end();
}
say(failures.length === 0 ? "verify: everything Task 3.9 asks of bots and processes holds" : `verify: ${failures.length} thing(s) did not hold`);
process.exit(failures.length === 0 ? 0 : 1);
