// Os recados do dia in the street: where each errand is (a gold mark on the compass), the neighbour waiting
// there (somebody of the street, turning to look at whoever comes), the gold button when the player stands at
// the place, and the evening the light goes (the apagão). Fetched once the player is in the street with others.

import { CELL_WALK, DEFAULT_CHARACTER, bodyFits, groundHeight } from "@nzila/sim";
import { type CompassMark } from "@nzila/ui";
import { PointLight } from "three";
import { type DistrictScene } from "../render/district-scene.ts";
import { type Body } from "../render/people.ts";
import { type WorldRenderer } from "../render/world-renderer.ts";
import { thingsNow } from "../world/money.ts";
import { feito, onToday, placeIn, tentar, today, whoOf, type FeitoSaid, type Recado, type Today } from "./recados.ts";

const STILL_APAGAO = new URLSearchParams(location.search).has("apagao");
/** `&festa` in the address: the festa tonight whatever the week, for stills. */
const STILL_FESTA = new URLSearchParams(location.search).has("festa");
/** The festa is from this hour of the game's evening, on a Saturday. */
const FESTA_FROM_S = 18 * 3600;
/** How near the place the button offers the errand, in metres: a little inside the zone's own reach. */
const AT_PLACE_M = 3.6;
/** Where the neighbour may stand, from the place's point: a step to one side or another, on open ground, so that the
 * place itself is free to stand on and nobody is put inside a caixa or a wall. */
const ASIDE: readonly (readonly [number, number])[] = [[1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2], [1.8, 0], [-1.8, 0]];

interface Waiting {
  readonly recado: Recado;
  readonly x: number;
  readonly z: number;
  body: Body | null;
  yaw: number;
}

export class StreetErrands {
  private readonly district: DistrictScene;
  private readonly renderer: WorldRenderer;
  private waiting: Waiting[] = [];
  private day: Today | null = null;
  /** What the Mochila holds, as last asked: an errand to bring a thing is offered only with the thing in it. */
  private held = new Set<string>();
  private readonly candle = new PointLight(undefined, 0, 7, 1.4);
  private stop: () => void;
  /** An errand being said done, so the button is not pressed twice. */
  private busy = false;

  constructor(district: DistrictScene, renderer: WorldRenderer) {
    this.district = district;
    this.renderer = renderer;
    this.stop = onToday((now) => this.take(now));
    // A candle's flame: warm and low.
    this.candle.color.setRGB(1, 0.66, 0.32);
  }

  /** Asks for today's errands, and what the Mochila holds (velas for the apagão). */
  async start(): Promise<void> {
    await today(true);
    await this.mochila();
  }

  /** The Mochila changed (a purchase, a thing handed over): what it holds now. */
  async mochila(): Promise<void> {
    const now = await thingsNow();
    if (now) this.held = new Set(now.items.map((one) => one.item));
  }

  private take(now: Today): void {
    this.day = now;
    const pois = this.district.manifest.pois.filter((one) => !one.id.startsWith("biscato-"));
    const open = now.recados.filter((one) => !one.done && (one.kind === "traz" || one.kind === "vaiver"));
    // Those done leave the street; those new come into it.
    for (const gone of this.waiting.filter((one) => !open.some((each) => each.n === one.recado.n))) {
      gone.body?.root.removeFromParent();
      gone.body?.release();
    }
    const kept = this.waiting.filter((one) => open.some((each) => each.n === one.recado.n));
    for (const recado of open) {
      if (kept.some((one) => one.recado.n === recado.n)) continue;
      const poi = placeIn(pois, recado.place);
      if (!poi) continue;
      const [ax, az] = this.aside(poi.pos[0], poi.pos[2]);
      const waiting: Waiting = { recado, x: ax, z: az, body: null, yaw: 0 };
      kept.push(waiting);
      const people = this.district.people;
      const who = people?.pick("any", recado.who + 2);
      if (people && who) {
        void people.makeBody(who).then((body) => {
          if (!body) return;
          if (!this.waiting.includes(waiting)) return body.release();
          const ground = this.district.chunks.ground();
          body.root.position.set(waiting.x, ground ? groundHeight(ground, Math.round(waiting.x * 1000), Math.round(waiting.z * 1000), CELL_WALK, DEFAULT_CHARACTER.stepUpMm) / 1000 : poi.pos[1], waiting.z);
          this.renderer.scene.add(body.root);
          waiting.body = body;
        });
      }
    }
    this.waiting = kept;
  }

  /** A spot beside a place where a body fits on open ground; the place itself when none does (or the ground is not in yet). */
  private aside(x: number, z: number): [number, number] {
    const ground = this.district.chunks.ground();
    if (!ground) return [x + ASIDE[0]![0], z];
    const r = DEFAULT_CHARACTER.radiusMm + 150;
    for (const [dx, dz] of ASIDE) {
      const xm = Math.round((x + dx) * 1000);
      const zm = Math.round((z + dz) * 1000);
      const h = groundHeight(ground, xm, zm, CELL_WALK, DEFAULT_CHARACTER.stepUpMm);
      if (bodyFits(ground, xm, zm, r, CELL_WALK, h, DEFAULT_CHARACTER.stepUpMm, DEFAULT_CHARACTER.maxDropMm)) return [x + dx, z + dz];
    }
    return [x, z];
  }

  /** The gold marks on the compass: the places of today's errands still to do. */
  marks(x: number, z: number): CompassMark[] {
    return this.waiting.map((one) => ({ bearing: ((Math.atan2(one.x - x, -(one.z - z)) * 180) / Math.PI + 360) % 360, metres: Math.hypot(one.x - x, one.z - z), kind: "target" as const }));
  }

  /** The errand whose place the player stands at, if any: what the gold button offers. */
  near(x: number, z: number): { n: number; kind: "traz" | "vaiver"; who: string } | null {
    if (this.busy) return null;
    const pois = this.district.manifest.pois.filter((one) => !one.id.startsWith("biscato-"));
    for (const one of this.waiting) {
      const poi = placeIn(pois, one.recado.place);
      // Nothing to hand over yet: the place's own button (the cantina's, the caixa's) stays, so the thing can be bought.
      if (one.recado.kind === "traz" && !this.held.has(one.recado.item ?? "")) continue;
      if (poi && Math.hypot(poi.pos[0] - x, poi.pos[2] - z) < AT_PLACE_M) return { n: one.recado.n, kind: one.recado.kind as "traz" | "vaiver", who: whoOf(one.recado.who) };
    }
    return null;
  }

  /** Poses the neighbours: still, turning to whoever comes near. Lights the candle in an apagão. */
  update(x: number, z: number, seconds: number, elapsedMs: number, secondOfDay: number): void {
    for (const one of this.waiting) {
      if (!one.body) continue;
      const far = Math.hypot(x - one.x, z - one.z);
      const want = far < 12 ? Math.atan2(x - one.x, z - one.z) : 0;
      one.yaw += Math.atan2(Math.sin(want - one.yaw), Math.cos(want - one.yaw)) * Math.min(1, elapsedMs / 400);
      one.body.root.rotation.y = one.yaw;
      one.body.pose({ speed: 0, phase: 0, time: seconds + one.recado.n * 3.1 });
    }
    if (this.district.crowd) this.district.crowd.festa = this.festa(secondOfDay);
    const dark = this.dark(secondOfDay);
    this.renderer.power += ((dark ? 0 : 1) - this.renderer.power) * Math.min(1, elapsedMs / 1500);
    // A candle carried: a small warm light round the player, only when it is dark and the light has gone.
    if (dark && this.held.has("velas")) {
      if (!this.candle.parent) this.renderer.scene.add(this.candle);
      this.candle.position.set(x, 1.3, z);
      this.candle.intensity = 3.2 + 0.4 * Math.sin(seconds * 9) + 0.2 * Math.sin(seconds * 23);
    } else if (this.candle.parent) {
      this.candle.removeFromParent();
    }
  }

  /** Whether it is the night of the bairro's festa: a Saturday evening of a week its errands reached the goal. */
  festa(secondOfDay: number): boolean {
    if (STILL_FESTA) return secondOfDay >= FESTA_FROM_S || secondOfDay < 3600;
    const day = this.day;
    if (!day || day.festa.done < day.festa.goal) return false;
    return new Date(`${day.day}T12:00:00Z`).getUTCDay() === 6 && secondOfDay >= FESTA_FROM_S;
  }

  /** Whether the light is out now: on a day it goes, in its hours. */
  dark(secondOfDay: number): boolean {
    // `&apagao` in the address: the light out tonight whatever the day, for stills.
    if (STILL_APAGAO && secondOfDay >= 68_400) return true;
    const day = this.day;
    return day !== null && day.apagao && secondOfDay >= day.apagaoHoras[0] && secondOfDay < day.apagaoHoras[1];
  }

  /** Says an errand done. What the server says, and who thanks. */
  async act(n: number): Promise<{ said: FeitoSaid; pay?: number; who: string }> {
    const one = this.day?.recados.find((each) => each.n === n);
    this.busy = true;
    const answer = await feito(n);
    this.busy = false;
    if (answer.said === "ok" && one?.kind === "traz") void this.mochila();
    return { ...answer, who: one ? whoOf(one.who) : "" };
  }

  /** Someone was met: if today's errand is to greet a newcomer, it may be done now. */
  async met(): Promise<{ said: FeitoSaid; pay?: number; who: string } | null> {
    const one = this.day?.recados.find((each) => each.kind === "cumprimenta" && !each.done);
    if (!one) return null;
    const answer = await tentar(one.n);
    return answer.said === "ok" ? { ...answer, who: whoOf(one.who) } : null;
  }

  close(): void {
    this.stop();
    for (const one of this.waiting) {
      one.body?.root.removeFromParent();
      one.body?.release();
    }
    this.candle.removeFromParent();
    this.candle.dispose();
    this.renderer.power = 1;
  }
}
