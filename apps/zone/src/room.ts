// A channel on the network (Task 3.1): a Colyseus room round a Channel.
// The room knows sockets and the database; the channel knows the world. The
// room library gives us rooms, seats and a socket; every byte that crosses is
// ours (packages/protocol), under one carrier type (D-3.6).
//
// Who may come in: whoever holds a session token the API would accept, with a
// client that speaks a protocol the zone knows. Where they arrive: where they
// last stood in this district, or at its door. What they may say: the stick.
// Where they are is never theirs to say (D-3.1).

import { Room, ServerError, type Client } from "@colyseus/core";
import { keepWhereabouts, playerOfSession, whereaboutsOf } from "@nzila/db";
import { CARRIER, JOIN_REFUSAL, JOIN_REFUSED_AT, PROTOCOL_VERSION, ZONE_CLOSE, decodeClientMessage, encodeJoinAccepted, negotiate } from "@nzila/protocol";
import { type Sql } from "postgres";
import { Channel, type Place } from "./channel.ts";
import { type District } from "./district.ts";

/** How many people one channel holds (the roadmap's number, proved or changed by the load test of 3.7). */
export const CHANNEL_HOLDS = 80;
/** One step of the world, in milliseconds: twenty a second. */
export const STEP_MS = 50;
/** A snapshot goes out every this many steps: ten a second. */
export const STEPS_A_SNAPSHOT = 2;
/** Everyone's place is written down this often while they play, so that a zone that falls loses little: every thirty seconds. */
export const STEPS_A_CHECKPOINT = 600;
/** Messages a client may send in a second. A game sends twenty; the rest is noise and is not read. */
export const MESSAGES_A_SECOND = 60;
/** How many times a client may send what cannot be read, or flood, before it is put out. */
export const STRIKES = 5;
/** How far behind the loop may fall and still catch up, in steps; beyond it time is let go, not made up in a rush. */
const CATCH_UP_STEPS = 3;

export interface ZoneDeps {
  readonly sql: Sql;
  readonly district: District;
  /** Where the zone says what went wrong. */
  readonly log?: (line: string) => void;
}

/** What the room keeps of each socket. */
interface Held {
  readonly entityId: number;
  readonly playerId: string;
  /** Messages in the second now running, and how many times this client has gone too far. */
  heard: number;
  strikes: number;
}

/** How long the world's steps have been taking: what the load test reads (3.7). */
export interface Pace {
  steps: number;
  lastMs: number;
  worstMs: number;
  totalMs: number;
}

const refusal = (code: number, why: string): ServerError => new ServerError(JOIN_REFUSED_AT + code, why);

/** The room class for one district. Each room made from it is one channel. */
export function channelRoom(deps: ZoneDeps) {
  const { sql, district } = deps;
  const log = deps.log ?? ((line: string) => console.error(line));
  let channels = 0;

  return class ChannelRoom extends Room {
    /** Before there is a seat: the session token, checked as the API checks it, and the protocol the client speaks. */
    static override async onAuth(token: string, options: { protocolVersion?: unknown } | undefined): Promise<{ playerId: string }> {
      const spoken = typeof options?.protocolVersion === "number" ? options.protocolVersion : 0;
      const verdict = negotiate(spoken);
      if (verdict === "client_too_old") throw refusal(JOIN_REFUSAL.REFRESH, "refresh");
      if (verdict === "client_too_new") throw refusal(JOIN_REFUSAL.RETRY, "retry");
      const player = typeof token === "string" && token.length > 0 ? await playerOfSession(sql, token) : null;
      if (!player) throw refusal(JOIN_REFUSAL.BAD_SEAT, "bad_seat");
      return { playerId: player.id };
    }

    override maxClients = CHANNEL_HOLDS;
    // No schema state: nothing is patched by the library.
    override patchRate = null;

    readonly channel = new Channel(district.ground);
    readonly number = ++channels;
    readonly pace: Pace = { steps: 0, lastMs: 0, worstMs: 0, totalMs: 0 };
    readonly held = new Map<string, Held>();
    readonly sockets = new Map<string, Client>();
    owedMs = 0;
    wokeAt = performance.now();

    override onCreate(): void {
      this.onMessageBytes(CARRIER, (client: Client, bytes: Uint8Array) => this.hear(client, bytes));
      // The library's timer wakes us; how long has passed we measure ourselves (its own count of it is shared
      // with whatever else reads the room's clock, and came up short); the steps are ours, each the same length.
      this.setTimestep(() => {
        const now = performance.now();
        this.owedMs += now - this.wokeAt;
        this.wokeAt = now;
        for (let done = 0; this.owedMs >= STEP_MS && done < CATCH_UP_STEPS; done++) {
          this.owedMs -= STEP_MS;
          this.step();
        }
        if (this.owedMs >= STEP_MS) this.owedMs = 0;
      }, STEP_MS / 2);
    }

    override async onJoin(client: Client): Promise<void> {
      const { playerId } = client.auth as { playerId: string };
      const last = await whereaboutsOf(sql, playerId);
      let at: Place = last && last.districtId === district.id ? { x: last.x, y: last.y, z: last.z, yaw: district.arrival.yaw } : district.arrival;
      // The same player from a second place: the first is put out, and the new one stands where they stood.
      for (const [sessionId, other] of this.held) {
        if (other.playerId !== playerId) continue;
        at = this.channel.leave(other.entityId)?.at ?? at;
        this.held.delete(sessionId);
        this.sockets.get(sessionId)?.leave(ZONE_CLOSE.ELSEWHERE);
        this.sockets.delete(sessionId);
      }
      const entityId = this.channel.join(playerId, at) ?? this.channel.join(playerId, district.arrival);
      if (entityId === null) throw refusal(JOIN_REFUSAL.FULL, "full");
      this.held.set(client.sessionId, { entityId, playerId, heard: 0, strikes: 0 });
      this.sockets.set(client.sessionId, client);
      client.sendBytes(
        CARRIER,
        encodeJoinAccepted({ protocolVersion: PROTOCOL_VERSION, entityId, tick: this.channel.world.tick, serverTimeMs: Date.now(), provinceId: district.provinceId, districtId: district.id, channel: this.number }),
      );
    }

    override async onLeave(client: Client): Promise<void> {
      const held = this.held.get(client.sessionId);
      this.held.delete(client.sessionId);
      this.sockets.delete(client.sessionId);
      if (!held) return;
      const left = this.channel.leave(held.entityId);
      if (left) await this.keep(left.playerId, left.at);
    }

    /** Anything thrown inside the room is said, and the room goes on: one bad step must not end the street for eighty people. */
    override onUncaughtException(error: Error, where: string): void {
      log(`zone: ${where}: ${error.stack ?? String(error)}`);
    }

    /** A message from a client: read, counted, and, when it is a stick, given to the channel. */
    hear(client: Client, bytes: Uint8Array): void {
      const held = this.held.get(client.sessionId);
      if (!held) return;
      held.heard++;
      if (held.heard > MESSAGES_A_SECOND) {
        // Not read at all. The first one over the line in a second is counted against them.
        if (held.heard === MESSAGES_A_SECOND + 1) this.strike(client, held);
        return;
      }
      try {
        const message = decodeClientMessage(bytes);
        if (message.type === "input") this.channel.input(held.entityId, message);
        // Talk arrives with Task 3.5; a second "join" on a seat already taken means nothing.
      } catch {
        this.strike(client, held);
      }
    }

    strike(client: Client, held: Held): void {
      held.strikes++;
      if (held.strikes >= STRIKES) client.leave(ZONE_CLOSE.MISBEHAVED);
    }

    /** One step of the world, and what follows from it: snapshots, the count of messages, the checkpoint. */
    step(): void {
      const began = performance.now();
      this.channel.tick();
      const tick = this.channel.world.tick;
      if (tick % STEPS_A_SNAPSHOT === 0) {
        const everyone = this.channel.entities();
        for (const [sessionId, held] of this.held) {
          const bytes = this.channel.snapshotFor(held.entityId, everyone);
          if (bytes) this.sockets.get(sessionId)?.sendBytes(CARRIER, bytes);
        }
      }
      if (tick % (1000 / STEP_MS) === 0) for (const held of this.held.values()) held.heard = 0;
      if (tick % STEPS_A_CHECKPOINT === 0) {
        for (const held of this.held.values()) {
          const at = this.channel.placeOf(held.entityId);
          if (at) void this.keep(held.playerId, at);
        }
      }
      const took = performance.now() - began;
      this.pace.steps++;
      this.pace.lastMs = took;
      this.pace.totalMs += took;
      if (took > this.pace.worstMs) this.pace.worstMs = took;
    }

    /** Writes down where a player stands. A failure is said and survived: the player goes on playing. */
    async keep(playerId: string, at: Place): Promise<void> {
      try {
        await keepWhereabouts(sql, playerId, district.provinceId, { districtId: district.id, x: at.x, y: at.y, z: at.z });
      } catch (error) {
        log(`zone: could not keep where ${playerId} stands: ${String(error)}`);
      }
    }
  };
}
