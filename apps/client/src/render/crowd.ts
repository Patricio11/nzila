// The people of the street, drawn. crowd-plan.ts says where each one is and
// what they are doing; this file gives the nearest of them a body and poses
// it. A whole body is dear, so only the nearest few wear one; the rest of the
// street wears the light body (D-0.30), which is the same person in a fifth
// of the triangles.

import { type Ground } from "@nzila/sim";
import { type Manifest } from "@nzila/world/client";
import { Group } from "three";
import { meteredFetch } from "../net/data-meter.ts";
import { actorAt, type ActorMoment, type CrowdActor, type CrowdFile } from "./crowd-plan.ts";
import { type Body, type Listed, type People } from "./people.ts";
import { EMOTES, EMOTE_SECONDS, Person, strideOf, type Emote } from "./person.ts";
import { type WorldRenderer } from "./world-renderer.ts";

/** Nobody further than this from the viewer is given a body, in metres. */
const REACH_M = 70;
/** How near someone is for their whole body to be worth its triangles: beyond it, the light one cannot be told from it on a phone. */
const WHOLE_M = 16;
/** How many of them cast a real shadow. */
const SHADOWS = 3;

interface Walker {
  readonly id: number;
  readonly actor: CrowdActor;
  readonly who: Listed;
  /** The light body, which everyone has from the start. */
  readonly person: Body;
  /** The whole body, fetched the first time they come near. */
  whole: Body | null;
  fetching: boolean;
  yaw: number;
  shown: boolean;
  sit: number;
}

export interface PersonSeen {
  /** Which of the district's people this is: their place in its list. */
  readonly id: number;
  readonly female: boolean;
  /** How high the top of their head is, as they stand or sit. */
  readonly top: number;
  readonly role: string;
  readonly x: number;
  readonly z: number;
  readonly pose: string;
  readonly speed: number;
}

export class Crowd {
  private readonly walkers: Walker[] = [];
  private readonly root = new Group();
  private readonly renderer: WorldRenderer;
  private people: People | null = null;
  /** Those with a body at the last update. */
  seen: PersonSeen[] = [];
  /** The night of the bairro's festa: those who come only for it are in the street. */
  festa = false;

  private constructor(renderer: WorldRenderer) {
    this.renderer = renderer;
    renderer.scene.add(this.root);
  }

  /** Opens the crowd of a district, or resolves to null when it has none or the people are not built. */
  static async open(renderer: WorldRenderer, base: string, manifest: Manifest, people: People | null): Promise<Crowd | null> {
    if (!manifest.npc.crowd || !people) return null;
    try {
      const file = JSON.parse(new TextDecoder().decode(await meteredFetch(base + manifest.npc.crowd))) as CrowdFile;
      const crowd = new Crowd(renderer);
      crowd.people = people;
      // Everyone arrives in the light body: a third of the download, a fifth of the triangles.
      await Promise.all(
        file.actors.map(async (actor, n) => {
          const who = people.pick(actor.role, actor.who ?? n);
          const person = who ? await people.makeBody(who, true) : null;
          if (!who || !person) return;
          person.root.visible = false;
          person.shadow = false;
          crowd.root.add(person.root);
          crowd.walkers.push({ id: n, actor, who, person, whole: null, fetching: false, yaw: 0, shown: false, sit: 0 });
        }),
      );
      return crowd;
    } catch {
      return null;
    }
  }

  /** Gives the nearest people their bodies and poses them for this moment. */
  update(nowMs: number, elapsedMs: number, viewerX: number, viewerZ: number, ground: Ground | null): void {
    const seconds = nowMs / 1000;
    // The nearest few wear their whole body (two on the reference phone and at Normal, four at Alta: some 5.500
    // triangles each since the people were rebuilt, and one that casts a shadow is drawn twice, F-215). Everyone
    // else the tier allows wears the light one, some 800 triangles and no shadow: 9, 18 or 30 people in all.
    // And only those near enough for it to be seen (WHOLE_M): at Zango's crossroads four whole bodies stood up to
    // forty metres off, and with the rest of the street's people they were a third of a picture that was over the
    // budget (F-290).
    const few = Math.max(2, Math.round(this.renderer.tier.crowd / 10));
    const most = Math.round(this.renderer.tier.crowd * 0.75);
    const near: { walker: Walker; at: ActorMoment; far: number }[] = [];
    for (const walker of this.walkers) {
      if (walker.actor.festa && !this.festa) {
        walker.person.root.visible = false;
        if (walker.whole) walker.whole.root.visible = false;
        walker.shown = false;
        continue;
      }
      const at = actorAt(walker.actor, seconds);
      const far = Math.hypot(at.x - viewerX, at.z - viewerZ);
      walker.person.root.visible = false;
      if (walker.whole) walker.whole.root.visible = false;
      if (far < REACH_M) near.push({ walker, at, far });
      else walker.shown = false;
    }
    near.sort((a, b) => a.far - b.far);
    const wholes = Math.min(few, near.filter(({ far }) => WHOLE_M > far).length);
    const seen: PersonSeen[] = [];
    for (const [n, { walker, at }] of near.entries()) {
      if (n >= most) {
        walker.shown = false;
        continue;
      }
      // Near enough for the whole body: it is fetched once, and the light one stands in until it has come.
      if (n < wholes && !walker.whole && !walker.fetching && this.people) {
        walker.fetching = true;
        void this.people.makeBody(walker.who).then((whole) => {
          // Not come (a weak line): asked for again in a while, not every frame.
          if (!whole) {
            setTimeout(() => (walker.fetching = false), 10_000);
            return;
          }
          whole.root.visible = false;
          this.root.add(whole.root);
          walker.whole = whole;
        });
      }
      const person = n < wholes && walker.whole ? walker.whole : walker.person;
      const turn = Math.atan2(Math.sin(at.yaw - walker.yaw), Math.cos(at.yaw - walker.yaw));
      walker.yaw = walker.shown ? walker.yaw + turn * Math.min(1, elapsedMs / 220) : at.yaw;
      // "baixo" is seated low, on a little bench; "baixo-chamar" the same, calling to someone.
      const lowly = at.pose.startsWith("baixo");
      const seated = at.pose === "sit" || lowly;
      walker.sit = walker.shown ? walker.sit + ((seated ? 1 : 0) - walker.sit) * Math.min(1, elapsedMs / 220) : seated ? 1 : 0;
      walker.shown = true;
      const y = walker.actor.y ?? (ground ? ground.heightAt(Math.floor((at.x * 1000) / ground.cellMm), Math.floor((at.z * 1000) / ground.cellMm)) / 1000 : 0);
      const stride = strideOf(at.speed, person.height, person.skirt);
      const gesture: Emote | undefined = EMOTES.find((kind) => kind === at.pose || `baixo-${kind}` === at.pose);
      // A whole body's shadow is cast by its light one, posed the same and not otherwise drawn: a shadow cannot
      // tell 6.000 triangles from 900, and the picture is that much lighter (F-257).
      const light = walker.person instanceof Person ? walker.person : null;
      const shade = light && n < SHADOWS && person === walker.whole && this.renderer.tier.shadows === "sun" ? light : null;
      // A dog is small enough to cast its own.
      person.shadow = !light && n < SHADOWS && person === walker.whole;
      if (light) light.shadowOnly = shade !== null;
      for (const body of shade ? [person, shade] : [person]) {
        body.root.visible = true;
        body.root.position.set(at.x, y, at.z);
        body.root.rotation.y = walker.yaw;
        body.pose(
          { speed: at.speed, phase: (at.travelled / stride) * Math.PI * 2, time: seconds + walker.actor.offset },
          {
            sit: walker.sit,
            ...(lowly ? { low: walker.sit } : {}),
            ...(gesture ? { emote: { kind: gesture, seconds: at.since % EMOTE_SECONDS[gesture] } } : {}),
            ...(at.pose === "fish" ? { hold: "cana" as const } : walker.actor.role === "zungueira" ? { hold: "bacia" as const } : {}),
          },
        );
      }
      seen.push({ id: walker.id, female: person.female, top: y + person.height * (1 - 0.3 * walker.sit), role: walker.actor.role, x: at.x, z: at.z, pose: at.pose, speed: at.speed });
    }
    this.seen = seen;
  }

  close(): void {
    this.renderer.scene.remove(this.root);
    for (const walker of this.walkers) {
      walker.person.release();
      walker.whole?.release();
    }
  }
}
