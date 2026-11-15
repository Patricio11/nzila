// The people of the street, drawn. crowd-plan.ts says where each one is and
// what they are doing; this file gives the nearest of them a body and poses
// it. A body is a whole skinned person, which is dear, so only a few are
// shown at once (fewer on a slow phone): the rest wait for the lighter body
// and the baked crowd of D-0.30.

import { type Ground } from "@nzila/sim";
import { type Manifest } from "@nzila/world/client";
import { Group } from "three";
import { meteredFetch } from "../net/data-meter.ts";
import { actorAt, type ActorMoment, type CrowdActor, type CrowdFile } from "./crowd-plan.ts";
import { type People } from "./people.ts";
import { EMOTES, EMOTE_SECONDS, type Emote, type Person } from "./person.ts";
import { type WorldRenderer } from "./world-renderer.ts";

/** Nobody further than this from the viewer is given a body, in metres. */
const REACH_M = 70;
/** How many of them cast a real shadow. */
const SHADOWS = 3;

interface Walker {
  readonly actor: CrowdActor;
  readonly person: Person;
  yaw: number;
  shown: boolean;
  sit: number;
}

export interface PersonSeen {
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
  /** Those with a body at the last update. */
  seen: PersonSeen[] = [];

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
      await Promise.all(
        file.actors.map(async (actor, n) => {
          const who = people.pick(actor.role, actor.who ?? n);
          const person = who ? await people.make(who) : null;
          if (!person) return;
          person.root.visible = false;
          crowd.root.add(person.root);
          crowd.walkers.push({ actor, person, yaw: 0, shown: false, sit: 0 });
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
    // Three on the reference phone, six at Normal, ten at Alta: a whole body is some 2.400 triangles, and
    // one that casts a shadow is drawn twice. Only the nearest few cast one.
    const most = Math.max(3, Math.round(this.renderer.tier.crowd / 4));
    const near: { walker: Walker; at: ActorMoment; far: number }[] = [];
    for (const walker of this.walkers) {
      const at = actorAt(walker.actor, seconds);
      const far = Math.hypot(at.x - viewerX, at.z - viewerZ);
      walker.person.root.visible = false;
      if (far < REACH_M) near.push({ walker, at, far });
      else walker.shown = false;
    }
    near.sort((a, b) => a.far - b.far);
    const seen: PersonSeen[] = [];
    for (const [n, { walker, at }] of near.entries()) {
      if (n >= most) {
        walker.shown = false;
        continue;
      }
      const person = walker.person;
      const turn = Math.atan2(Math.sin(at.yaw - walker.yaw), Math.cos(at.yaw - walker.yaw));
      walker.yaw = walker.shown ? walker.yaw + turn * Math.min(1, elapsedMs / 220) : at.yaw;
      // "baixo" is seated low, on a little bench; "baixo-chamar" the same, calling to someone.
      const lowly = at.pose.startsWith("baixo");
      const seated = at.pose === "sit" || lowly;
      walker.sit = walker.shown ? walker.sit + ((seated ? 1 : 0) - walker.sit) * Math.min(1, elapsedMs / 220) : seated ? 1 : 0;
      walker.shown = true;
      const y = walker.actor.y ?? (ground ? ground.heightAt(Math.floor((at.x * 1000) / ground.cellMm), Math.floor((at.z * 1000) / ground.cellMm)) / 1000 : 0);
      person.root.visible = true;
      person.shadow = n < SHADOWS;
      person.root.position.set(at.x, y, at.z);
      person.root.rotation.y = walker.yaw;
      const stride = (at.speed > 2.2 ? 2.5 : 1.42) * (person.height / 1.7) * (person.skirt ? 0.8 : 1);
      const gesture: Emote | undefined = EMOTES.find((kind) => kind === at.pose || `baixo-${kind}` === at.pose);
      person.pose(
        { speed: at.speed, phase: (at.travelled / stride) * Math.PI * 2, time: seconds + walker.actor.offset },
        {
          sit: walker.sit,
          ...(lowly ? { low: walker.sit } : {}),
          ...(gesture ? { emote: { kind: gesture, seconds: at.since % EMOTE_SECONDS[gesture] } } : {}),
          ...(at.pose === "fish" ? { hold: "cana" as const } : walker.actor.role === "zungueira" ? { hold: "bacia" as const } : {}),
        },
      );
      seen.push({ role: walker.actor.role, x: at.x, z: at.z, pose: at.pose, speed: at.speed });
    }
    this.seen = seen;
  }

  close(): void {
    this.renderer.scene.remove(this.root);
    for (const walker of this.walkers) walker.person.release();
  }
}
