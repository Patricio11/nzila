// Headless players (Task 3.7). Each opens a line to a zone as a phone does,
// says who it is, and then behaves like someone in a street: walks a while
// one way, turns, stands, sometimes runs. Each counts what it is sent. What
// comes back is what a phone in a full channel would have had to download,
// and beside it (read from the zone's own /health) how long the zone's steps
// took with all of them in.
//
// The bots are driven by a seeded generator, so that two runs ask the zone
// the same thing.

import { PROTOCOL_VERSION, decodeSnapshot, decodeZoneMessage, encodeInput, encodeJoin, type InputFrame, type Snapshot } from "@nzila/protocol";
import { SIM_STEP_MS } from "@nzila/sim";

export interface SwarmOptions {
  /** The zone's address and the district's room: ws://host:port/room. */
  readonly url: string;
  /** One session token for each bot. */
  readonly tokens: readonly string[];
  readonly seconds: number;
  readonly seed?: number;
  /** Bots come in this far apart, in milliseconds: a crowd arrives over a few seconds, not in one instant. */
  readonly staggerMs?: number;
  /** Called when the count has ended and everyone is still in: the moment to ask the zone how it did. */
  readonly whileFull?: () => Promise<void>;
}

export interface SwarmReport {
  readonly asked: number;
  /** How many were let in, and how many were still in at the end. */
  readonly joined: number;
  readonly stayed: number;
  readonly seconds: number;
  /** Bytes a second sent to one bot while everyone was in: the mean over the bots, and the bot that was sent most. Message bodies, without the few bytes of framing each travels in. */
  readonly downBytesPerSecond: { readonly mean: number; readonly worst: number };
  /** Snapshots a second received by a bot, on the mean. */
  readonly snapshotsPerSecond: number;
  /** How many others a bot was told of, on the mean and at the most. */
  readonly seen: { readonly mean: number; readonly most: number };
  /** Bytes of the largest single message any bot was sent. */
  readonly largestMessage: number;
}

interface Bot {
  readonly socket: WebSocket;
  readonly had: Map<number, Snapshot>;
  accepted: boolean;
  open: boolean;
  seq: number;
  ackTick: number;
  frames: InputFrame[];
  /** What it is doing now, and for how many more steps. */
  doing: InputFrame;
  left: number;
  bytes: number;
  snapshots: number;
  seenSum: number;
  seenMost: number;
  largest: number;
}

const STILL: InputFrame = { dx: 0, dz: 0, run: false, brake: false };

/** A small generator of our own: the same seed, the same crowd. */
function generator(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

/** What someone in a street does next: mostly walks somewhere, sometimes stands, now and then runs. */
function next(random: () => number): { doing: InputFrame; left: number } {
  const steps = 20 + Math.floor(random() * 70);
  if (random() < 0.25) return { doing: STILL, left: steps };
  const angle = random() * Math.PI * 2;
  return { doing: { dx: Math.round(Math.sin(angle) * 127), dz: Math.round(Math.cos(angle) * 127), run: random() < 0.15, brake: false }, left: steps };
}

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export async function runSwarm(options: SwarmOptions): Promise<SwarmReport> {
  const random = generator(options.seed ?? 7);
  const bots: Bot[] = [];
  let measuring = false;

  for (const token of options.tokens) {
    const socket = new WebSocket(options.url);
    socket.binaryType = "arraybuffer";
    const bot: Bot = { socket, had: new Map(), accepted: false, open: false, seq: 0, ackTick: 0, frames: [], ...next(random), bytes: 0, snapshots: 0, seenSum: 0, seenMost: 0, largest: 0 };
    socket.onopen = () => {
      bot.open = true;
      socket.send(encodeJoin({ protocolVersion: PROTOCOL_VERSION, token }));
    };
    socket.onclose = () => void (bot.open = false);
    socket.onerror = () => {};
    socket.onmessage = (event: MessageEvent) => {
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      if (measuring) {
        bot.bytes += bytes.length;
        bot.largest = Math.max(bot.largest, bytes.length);
      }
      const message = decodeZoneMessage(bytes);
      if (message.type === "join_accepted") bot.accepted = true;
      if (message.type !== "snapshot") return;
      // Read whole, as a phone must, so that the next difference can be read and the zone is told what was had.
      const snapshot = decodeSnapshot(bytes, (tick) => bot.had.get(tick));
      bot.had.set(snapshot.tick, snapshot);
      bot.ackTick = snapshot.tick;
      for (const tick of bot.had.keys()) {
        if (bot.had.size <= 32) break;
        bot.had.delete(tick);
      }
      if (measuring) {
        bot.snapshots++;
        bot.seenSum += snapshot.entities.length - 1;
        bot.seenMost = Math.max(bot.seenMost, snapshot.entities.length - 1);
      }
    };
    bots.push(bot);
    if (options.staggerMs) await pause(options.staggerMs);
  }

  // The stick, twenty times a second, for every bot that is in.
  const sticks = setInterval(() => {
    for (const bot of bots) {
      if (!bot.accepted || !bot.open) continue;
      if (bot.left-- <= 0) Object.assign(bot, next(random));
      bot.seq++;
      bot.frames = [bot.doing, ...bot.frames].slice(0, 3);
      bot.socket.send(encodeInput({ seq: bot.seq, ackTick: bot.ackTick, frames: bot.frames }));
    }
  }, SIM_STEP_MS);

  // A moment for everyone to arrive and spread, then the count begins.
  const arriveBy = Date.now() + 10_000;
  while (bots.some((bot) => !bot.accepted && bot.socket.readyState <= 1) && Date.now() < arriveBy) await pause(50);
  await pause(2000);
  const joined = bots.filter((bot) => bot.accepted).length;
  measuring = true;
  await pause(options.seconds * 1000);
  measuring = false;
  const stayed = bots.filter((bot) => bot.accepted && bot.open).length;
  await options.whileFull?.();
  clearInterval(sticks);
  for (const bot of bots) bot.socket.close();
  await pause(200);

  const counted = bots.filter((bot) => bot.accepted);
  const mean = (values: number[]): number => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  return {
    asked: options.tokens.length,
    joined,
    stayed,
    seconds: options.seconds,
    downBytesPerSecond: { mean: mean(counted.map((bot) => bot.bytes / options.seconds)), worst: Math.max(0, ...counted.map((bot) => bot.bytes / options.seconds)) },
    snapshotsPerSecond: mean(counted.map((bot) => bot.snapshots / options.seconds)),
    seen: { mean: mean(counted.map((bot) => (bot.snapshots ? bot.seenSum / bot.snapshots : 0))), most: Math.max(0, ...counted.map((bot) => bot.seenMost)) },
    largestMessage: Math.max(0, ...counted.map((bot) => bot.largest)),
  };
}
