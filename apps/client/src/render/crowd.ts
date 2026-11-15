// The people of the street, drawn. crowd-plan.ts says where each one is and
// what they are doing; this file gives the nearest of them a body and poses
// it. A body is a whole skinned person, which is dear, so only a few are
// shown at once (fewer on a slow phone): the rest wait for the lighter body
// and the baked crowd of D-0.30.

import { type Ground } from "@nzila/sim";
import { type Manifest } from "@nzila/world/client";
import { Group, Mesh, SkinnedMesh, type BufferGeometry, type Material, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { meteredFetch } from "../net/data-meter.ts";
import { actorAt, type ActorMoment, type CrowdActor, type CrowdFile } from "./crowd-plan.ts";
import { EMOTES, EMOTE_SECONDS, Person, type Emote } from "./person.ts";
import { type WorldRenderer } from "./world-renderer.ts";

const PEOPLE = "/packs/dev-people/";
/** Nobody further than this from the viewer is given a body, in metres. */
const REACH_M = 70;
/** How many of them cast a real shadow. */
const SHADOWS = 3;

interface Listed {
  readonly role?: string;
  readonly model: string;
  readonly height: number;
  readonly skirt: boolean;
  readonly female?: boolean;
}

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
  private readonly geometries = new Set<BufferGeometry>();
  /** Those with a body at the last update. */
  seen: PersonSeen[] = [];

  private constructor(renderer: WorldRenderer) {
    this.renderer = renderer;
    renderer.scene.add(this.root);
  }

  /** Opens the crowd of a district, or resolves to null when it has none or the people are not built. */
  static async open(renderer: WorldRenderer, base: string, manifest: Manifest): Promise<Crowd | null> {
    if (!manifest.npc.crowd) return null;
    try {
      const read = async <T>(url: string): Promise<T> => JSON.parse(new TextDecoder().decode(await meteredFetch(url))) as T;
      const [file, list] = await Promise.all([read<CrowdFile>(base + manifest.npc.crowd), read<{ people: Listed[] }>(`${PEOPLE}pessoas.json`)]);
      const playable = list.people.filter((p) => !p.role);
      const crowd = new Crowd(renderer);
      const models = new Map<string, Promise<Object3D>>();
      const model = (name: string): Promise<Object3D> => {
        let loading = models.get(name);
        if (!loading) {
          loading = meteredFetch(PEOPLE + name).then(async (bytes) => (await new GLTFLoader().parseAsync(bytes, "")).scene);
          models.set(name, loading);
        }
        return loading;
      };
      await Promise.all(
        file.actors.map(async (actor, n) => {
          const fitting = actor.role === "any" ? playable : list.people.filter((p) => p.role === actor.role);
          const who = fitting[(actor.who ?? n) % Math.max(1, fitting.length)];
          if (!who) return;
          const scene = cloneSkinned(await model(who.model)) as Group;
          const found: SkinnedMesh[] = [];
          scene.traverse((node) => {
            if (!(node instanceof Mesh)) return;
            node.material = renderer.paletteMaterial;
            node.castShadow = true;
            node.receiveShadow = false;
            if (node instanceof SkinnedMesh) found.push(node);
          });
          const body = found[0];
          if (!body) return;
          crowd.geometries.add(body.geometry);
          const person = new Person(scene, body, who.height, who.skirt);
          person.female = who.female === true;
          person.root.visible = false;
          crowd.root.add(person.root);
          crowd.walkers.push({ actor, person, yaw: 0, shown: false, sit: 0 });
        }),
      );
      // The materials the files came with are not used: every body wears the world's one palette.
      for (const loading of models.values()) (await loading).traverse((node) => node instanceof Mesh && (node.material as Material).dispose());
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
      const seated = at.pose === "sit";
      walker.sit = walker.shown ? walker.sit + ((seated ? 1 : 0) - walker.sit) * Math.min(1, elapsedMs / 220) : seated ? 1 : 0;
      walker.shown = true;
      const y = walker.actor.y ?? (ground ? ground.heightAt(Math.floor((at.x * 1000) / ground.cellMm), Math.floor((at.z * 1000) / ground.cellMm)) / 1000 : 0);
      person.root.visible = true;
      person.shadow = n < SHADOWS;
      person.root.position.set(at.x, y, at.z);
      person.root.rotation.y = walker.yaw;
      const stride = (at.speed > 2.2 ? 2.5 : 1.42) * (person.height / 1.7) * (person.skirt ? 0.8 : 1);
      const gesture: Emote | undefined = EMOTES.find((kind) => kind === at.pose);
      person.pose(
        { speed: at.speed, phase: (at.travelled / stride) * Math.PI * 2, time: seconds + walker.actor.offset },
        {
          sit: walker.sit,
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
    for (const geometry of this.geometries) geometry.dispose();
    for (const walker of this.walkers) walker.person.dispose();
  }
}
