// The other players, as bodies in the street (Task 3.3). Each is dressed as
// their owner chose in the look chooser, walks with the same gait as the
// player's own avatar, and is named when they stand still (D-3.5).
//
// Where each is comes from net/others.ts; who each is comes from the zone
// (the Who message). A body is made when both are known, and let go when the
// zone stops speaking of them.

import { DOING, type Who } from "@nzila/protocol";
import { type Object3D } from "three";
import { type Seen } from "../net/others.ts";
import { type Named } from "./names.ts";
import { EMOTE_SECONDS, type Emote, type Person } from "./person.ts";
import { FIRST_LOOK, dress } from "./wardrobe.ts";
import { type WorldRenderer } from "./world-renderer.ts";

/** A body appears and goes over this long, so that nobody pops into the street. */
const ARRIVE_MS = 260;

interface Body {
  person: Person | null;
  /** How far through a stride, and how fast the legs are going: eased, so that a body never snaps between gaits. */
  phase: number;
  speed: number;
  facing: number | null;
  shown: number;
  air: number;
  /** A gesture under way, and when it began (in the seconds the picture counts). */
  emote: { kind: Emote; began: number | null } | null;
  x: number;
  y: number;
  z: number;
}

export class Players {
  private readonly renderer: WorldRenderer;
  private readonly bodies = new Map<number, Body>();
  private readonly faces = new Map<number, Who>();
  private closed = false;
  /** Where a van is drawn, and where in it each seat is: for whoever rides one. Given by the page, which has the traffic. */
  vanAt: (vehicle: number) => Object3D | null = () => null;
  seatAt: (seat: number) => readonly [number, number, number] | null = () => null;
  /** Whether the player has met whoever carries this BI: said by the session, which remembers. */
  knows: (bi: string) => boolean = () => false;

  constructor(renderer: WorldRenderer) {
    this.renderer = renderer;
  }

  /** How many bodies are in the street now: for the tests. */
  get count(): number {
    return [...this.bodies.values()].filter((body) => body.person).length;
  }

  /** The zone said who someone is. */
  know(who: Who): void {
    this.faces.set(who.entityId, who);
  }

  nameOf(id: number): string | null {
    return this.faces.get(id)?.name ?? null;
  }

  /** The body that carries this BI, among those known here. */
  entityOf(bi: string): number | null {
    for (const [id, who] of this.faces) if (who.bi === bi) return id;
    return null;
  }

  who(id: number): Who | null {
    return this.faces.get(id) ?? null;
  }

  /** Someone makes a gesture: their body makes it, from the next frame, for as long as it lasts or until they walk. */
  gesture(id: number, kind: Emote): void {
    const body = this.bodies.get(id);
    if (body) body.emote = { kind, began: null };
  }

  /** The gesture each body is making, or null: for the tests. */
  gesturing(): (string | null)[] {
    return [...this.bodies.values()].map((body) => body.emote?.kind ?? null);
  }

  /** Where the top of each body's head is: for what hangs over it, and for a finger. */
  heads(): { id: number; x: number; y: number; z: number }[] {
    const out: { id: number; x: number; y: number; z: number }[] = [];
    for (const [id, body] of this.bodies) if (body.person) out.push({ id, x: body.x, y: body.y + body.person.height, z: body.z });
    return out;
  }

  private make(id: number, who: Who): Body {
    const body: Body = { person: null, phase: 0, speed: 0, facing: null, shown: 0, air: 0, emote: null, x: 0, y: 0, z: 0 };
    // What came over the wire is checked again here; one who never chose is dressed in the first look.
    // The look was checked as it came off the wire; one whose look is not known is dressed in the first look.
    void dress(this.renderer, who.look ?? FIRST_LOOK)
      .then((person) => {
        if (this.closed || this.bodies.get(id) !== body) return person.release();
        person.root.visible = false;
        this.renderer.scene.add(person.root);
        body.person = person;
      })
      .catch(() => {
        // The wardrobe is not there: they are in the street, and not drawn.
      });
    return body;
  }

  /** Draws everyone where they are now. Returns them as people who can be named. */
  update(seen: readonly Seen[], elapsedMs: number, seconds: number): Named[] {
    const here = new Set<number>();
    const named: Named[] = [];
    for (const one of seen) {
      const who = this.faces.get(one.id);
      if (!who) continue;
      here.add(one.id);
      let body = this.bodies.get(one.id);
      if (!body) this.bodies.set(one.id, (body = this.make(one.id, who)));
      const person = body.person;
      if (!person) continue;
      body.shown = Math.min(1, body.shown + elapsedMs / ARRIVE_MS);
      body.speed += (one.speed - body.speed) * Math.min(1, elapsedMs / 110);
      const flying = one.anim === DOING.air;
      body.air += ((flying ? 1 : 0) - body.air) * Math.min(1, elapsedMs / 120);
      const strideM = (body.speed > 2.2 ? 2.5 : 1.42) * (person.height / 1.7) * (person.skirt ? 0.8 : 1);
      if (!flying) body.phase += ((body.speed * elapsedMs) / 1000 / strideM) * Math.PI * 2;
      // The zone turns a body at once; the picture turns it as a person turns.
      body.facing = body.facing === null ? one.facing : body.facing + Math.atan2(Math.sin(one.facing - body.facing), Math.cos(one.facing - body.facing)) * Math.min(1, elapsedMs / 90);
      Object.assign(body, { x: one.x, y: one.y, z: one.z });
      // Riding: seated in the van, wherever the van is drawn on this phone, and in the seat the zone gave them.
      const van = one.vehicleId === null ? null : this.vanAt(one.vehicleId);
      const seatPos = one.seat === null ? null : this.seatAt(one.seat);
      if (van && seatPos) {
        if (person.root.parent !== van) van.add(person.root);
        person.root.position.set(seatPos[0], seatPos[1] - 0.46 * (person.height / 1.7), seatPos[2]);
        person.root.rotation.y = 0;
        person.root.scale.setScalar(1);
        person.root.visible = true;
        person.pose({ speed: 0, phase: 0, time: seconds + one.id * 1.3 }, { sit: 1 });
        continue;
      }
      if (person.root.parent !== this.renderer.scene) this.renderer.scene.add(person.root);
      // A jump is drawn as a hop of the zone's own height at its middle: the zone says "in the air", not how high.
      person.root.position.set(one.x, one.y + body.air * 0.42, one.z);
      person.root.rotation.y = body.facing;
      person.root.scale.setScalar(0.6 + 0.4 * body.shown);
      person.root.visible = true;
      // A gesture lasts its time, and ends when its maker walks off.
      if (body.emote && body.emote.began === null) body.emote.began = seconds;
      if (body.emote && (seconds - body.emote.began! > EMOTE_SECONDS[body.emote.kind] || body.speed > 0.6 || flying)) body.emote = null;
      person.pose({ speed: body.speed, phase: body.phase, time: seconds + one.id * 1.3 }, { jump: body.air > 0.05 ? Math.min(0.95, body.air * 0.5) : 0, ...(body.emote ? { emote: { kind: body.emote.kind, seconds: seconds - body.emote.began! } } : {}) });
      named.push({ x: one.x, y: one.y + person.height, z: one.z, name: who.name, still: one.speed < 0.15 && !flying, known: who.bi !== "" && this.knows(who.bi) });
    }
    for (const [id, body] of this.bodies) {
      if (here.has(id)) continue;
      if (body.person) {
        body.person.root.removeFromParent();
        body.person.release();
      }
      this.bodies.delete(id);
      this.faces.delete(id);
    }
    return named;
  }

  close(): void {
    this.closed = true;
    this.update([], 0, 0);
  }
}
