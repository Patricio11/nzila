// The ball on a campo, as the zone keeps it (Zango's second pass, 2026-11-21). Whoever walks or runs into it
// kicks it the way they are going; it rolls and slows by the rule every phone knows (packages/protocol: bola.ts);
// it comes back off the edges of the pitch; and between the posts at either end it is a goal for whoever kicked
// it last. Whoever is on the campo plays, and each player's goals are counted until the campo has stood empty a
// while. Sides (D-11.11): whoever steps onto the pitch is put on the side with fewer, the amarelos (1) or the
// vermelhos (2); while each side has someone it is a match, a goal at the east end is the amarelos' and at the
// west end the vermelhos' whoever kicked it, and the first side to three wins. Nobody asks to play and nobody is
// asked: one walks on. The rules only: the room says who is near and tells the phones.

import { bolaAt, type Bola } from "@nzila/protocol/bola";

/** A pitch: its edges, and half the width of each goal (they stand in the middle of the two short ends, along X). Millimetres. */
export interface Campo {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly goal: number;
}

/** How near the ball a body must be to kick it, and how fast it must be going. */
export const KICK_REACH_MM = 750;
const KICK_AT_LEAST_MM_S = 400;
/** A kick sends the ball at the kicker's speed and half again, and this much more; never faster than the last. */
const KICK_ADDS_MM_S = 2600;
const KICK_AT_MOST_MM_S = 9500;
/** The same body does not kick twice within this long: the ball leaves the foot. */
const KICK_AGAIN_MS = 260;
/** What a ball keeps of its speed when it comes back off the edge of the pitch. */
const BOUNCE = 0.6;
/** After a goal the ball lies in the net a moment, then is put back in the middle. */
export const AFTER_GOAL_MS = 2500;
/** Goals are forgotten when nobody has touched the ball for this long. */
export const FORGOTTEN_MS = 5 * 60_000;

/** The amarelos attack the east goal and defend the west; the vermelhos the other way. */
export type Lado = 1 | 2;
/** The side that reaches this many goals wins, and the count begins again. */
export const MATCH_TO = 3;
/** Someone who has been off the pitch this long has left their side. */
export const OFF_PITCH_MS = 20_000;

export interface Golo {
  readonly id: number;
  readonly playerId: string;
  /** How many this player has scored. */
  readonly total: number;
  /** In a match: the side the goal counts for, what the score is now, and whether that side has just won. */
  readonly lado: Lado | 0;
  readonly placar: readonly [number, number];
  readonly fim: boolean;
}

export interface Kicker {
  /** Their number in the channel, and who they are. */
  readonly id: number;
  readonly playerId: string;
  readonly x: number;
  readonly z: number;
  /** Millimetres a second. */
  readonly vx: number;
  readonly vz: number;
  /** Whether they stand on the pitch itself, not beside it: only then are they on a side. */
  readonly on?: boolean;
}

export class BolaDoCampo {
  readonly campo: Campo;
  state: Bola;
  /** Each player's goals since the campo was last empty a long while. */
  readonly golos = new Map<string, number>();
  private last: { id: number; playerId: string; at: number } | null = null;
  private backAt: number | null = null;
  /** Who is on which side, by player; and the score of the match, the amarelos' first. */
  readonly lados = new Map<string, { id: number; lado: Lado; seenAt: number }>();
  placar: [number, number] = [0, 0];
  private won = false;

  private on(lado: Lado): number {
    let n = 0;
    for (const one of this.lados.values()) if (one.lado === lado) n++;
    return n;
  }

  /** Whether it is a match: each side has someone. */
  get jogo(): boolean {
    return this.on(1) > 0 && this.on(2) > 0;
  }

  /** Who has come onto the pitch is given a side, and who has been off it a while loses theirs. Says what changed. */
  private sides(nowMs: number, near: readonly Kicker[]): { id: number; lado: Lado | 0 }[] {
    const changed: { id: number; lado: Lado | 0 }[] = [];
    for (const one of near) {
      if (!one.on) continue;
      const had = this.lados.get(one.playerId);
      if (had) {
        had.seenAt = nowMs;
        had.id = one.id;
      } else {
        const lado: Lado = this.on(1) <= this.on(2) ? 1 : 2;
        this.lados.set(one.playerId, { id: one.id, lado, seenAt: nowMs });
        changed.push({ id: one.id, lado });
      }
    }
    for (const [playerId, one] of this.lados) {
      if (nowMs - one.seenAt <= OFF_PITCH_MS) continue;
      this.lados.delete(playerId);
      changed.push({ id: one.id, lado: 0 });
    }
    // A match that lost a whole side is over, and nobody won it.
    if (!this.jogo && (this.placar[0] > 0 || this.placar[1] > 0)) this.placar = [0, 0];
    return changed;
  }

  constructor(campo: Campo, nowMs: number) {
    this.campo = campo;
    this.state = this.middle(nowMs);
  }

  private middle(nowMs: number): Bola {
    return { x: Math.round((this.campo.x0 + this.campo.x1) / 2), z: Math.round((this.campo.z0 + this.campo.z1) / 2), vx: 0, vz: 0, atMs: nowMs };
  }

  /**
   * Time passes. `near` are the bodies on or beside the pitch, on foot. Says whether the ball was given a new
   * word (to be told to the phones), and a goal when one was scored.
   */
  step(nowMs: number, near: readonly Kicker[]): { moved: boolean; golo: Golo | null; lados: { id: number; lado: Lado | 0 }[] } {
    const { x0, z0, x1, z1, goal } = this.campo;
    const lados = this.sides(nowMs, near);
    // In the net after a goal: back to the middle when its moment is over, and after a win the count begins again.
    if (this.backAt !== null) {
      if (nowMs < this.backAt) return { moved: false, golo: null, lados };
      this.backAt = null;
      if (this.won) this.placar = [0, 0];
      this.won = false;
      this.state = this.middle(nowMs);
      return { moved: true, golo: null, lados };
    }
    if (this.last && nowMs - this.last.at > FORGOTTEN_MS && this.golos.size > 0) this.golos.clear();
    let at = bolaAt(this.state, nowMs);
    let moved = false;
    // Off the long sides it comes back.
    if (at.z < z0 || at.z > z1) {
      at = { ...at, z: at.z < z0 ? z0 : z1, vz: -at.vz * BOUNCE, vx: at.vx * BOUNCE };
      moved = true;
    }
    // Past a short end: between the posts it is a goal; beside them it comes back.
    if (at.x < x0 || at.x > x1) {
      const middleZ = (z0 + z1) / 2;
      if (Math.abs(at.z - middleZ) <= goal && this.last) {
        const total = (this.golos.get(this.last.playerId) ?? 0) + 1;
        this.golos.set(this.last.playerId, total);
        // It lies a little way into the net until it is put back.
        this.state = { x: Math.round(at.x < x0 ? x0 - 500 : x1 + 500), z: Math.round(at.z), vx: 0, vz: 0, atMs: nowMs };
        this.backAt = nowMs + AFTER_GOAL_MS;
        // In a match the goal is the side's that attacks that end, whoever kicked it: an own goal counts.
        const lado: Lado | 0 = this.jogo ? (at.x > x1 ? 1 : 2) : 0;
        if (lado !== 0) {
          this.placar[lado - 1] = (this.placar[lado - 1] ?? 0) + 1;
          this.won = this.placar[lado - 1]! >= MATCH_TO;
        }
        return { moved: true, golo: { id: this.last.id, playerId: this.last.playerId, total, lado, placar: [this.placar[0], this.placar[1]], fim: this.won }, lados };
      }
      at = { ...at, x: at.x < x0 ? x0 : x1, vx: -at.vx * BOUNCE, vz: at.vz * BOUNCE };
      moved = true;
    }
    // A kick: the nearest body within reach that is going fast enough, and going toward the ball.
    let kicker: Kicker | null = null;
    let nearest = KICK_REACH_MM;
    for (const one of near) {
      const far = Math.hypot(at.x - one.x, at.z - one.z);
      const speed = Math.hypot(one.vx, one.vz);
      if (far > nearest || speed < KICK_AT_LEAST_MM_S || one.vx * (at.x - one.x) + one.vz * (at.z - one.z) <= 0) continue;
      if (this.last && this.last.id === one.id && nowMs - this.last.at < KICK_AGAIN_MS) continue;
      kicker = one;
      nearest = far;
    }
    if (kicker) {
      const speed = Math.hypot(kicker.vx, kicker.vz);
      const sent = Math.min(KICK_AT_MOST_MM_S, speed * 1.5 + KICK_ADDS_MM_S);
      at = { x: at.x, z: at.z, vx: (kicker.vx / speed) * sent, vz: (kicker.vz / speed) * sent };
      this.last = { id: kicker.id, playerId: kicker.playerId, at: nowMs };
      moved = true;
    }
    if (moved) this.state = { x: Math.round(at.x), z: Math.round(at.z), vx: Math.round(at.vx), vz: Math.round(at.vz), atMs: nowMs };
    return { moved, golo: null, lados };
  }
}
