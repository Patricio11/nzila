// The ball on a campo, on this phone (Zango's second pass, 2026-11-21). The zone owns it: it says where the ball
// was and how it was moving after every kick, bounce and goal, and between those words the ball is drawn where
// the rule every phone shares puts it (packages/protocol: bola.ts). Walking into it kicks it; that is decided by
// the zone from where the player is, never said by the phone. A goal is said to whoever is near.
// Fetched the first time the zone speaks of a ball: the way in is full (F-270).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { EVENT, type WorldEvent } from "@nzila/protocol";
import { bolaAt, type Bola } from "@nzila/protocol/bola";
import { Banner } from "@nzila/ui";
import { WORLD } from "@nzila/world/client";
import { Color, Group, Mesh, MeshLambertMaterial, SRGBColorSpace, SphereGeometry, Vector3, type Scene } from "three";
import { useEffect, useState } from "preact/hooks";

// The words of this came with it.
tr.extend(ptAOLater);

declare global {
  interface Window {
    /** For the tests: where each ball is drawn (metres), and the last goal said. */
    __bola?: { balls: { x: number; z: number; moving: boolean }[]; golo: { nome: string; n: number } | null };
  }
}

/** What the street page gives this: the line to the zone, as far as a ball needs it. */
export interface Linha {
  readonly current: { bolas: WorldEvent[]; me: number | null; who(entity: number): { name: string } | null } | null;
}

const RADIUS_M = 0.115;
const paint = (rgb: readonly [number, number, number]): Color => new Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace);

interface Drawn {
  state: Bola;
  readonly body: Group;
  /** Where it was last drawn, to turn it by how far it has rolled. */
  x: number;
  z: number;
}

export class Bolas {
  private readonly scene: Scene;
  private readonly drawn = new Map<number, Drawn>();
  private readonly white = new MeshLambertMaterial({ color: paint(WORLD.paintWhite) });
  private readonly dark = new MeshLambertMaterial({ color: paint(WORLD.tarShade) });
  private readonly round = new SphereGeometry(RADIUS_M, 12, 8);
  private readonly patch = new SphereGeometry(RADIUS_M * 0.42, 6, 4);
  /** The last goal, until it has been said for long enough. */
  golo: { readonly nome: string; readonly n: number; readonly teu: boolean; readonly ate: number } | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** A ball as it is drawn: white, with dark patches sewn on, as a ball that has seen many afternoons. */
  private make(): Group {
    const body = new Group();
    const ball = new Mesh(this.round, this.white);
    ball.castShadow = true;
    body.add(ball);
    for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const piece = new Mesh(this.patch, this.dark);
      piece.position.set(x * RADIUS_M * 0.72, y * RADIUS_M * 0.72, z * RADIUS_M * 0.72);
      body.add(piece);
    }
    this.scene.add(body);
    return body;
  }

  /** Reads what the zone has said of balls, and draws each where it is now. */
  update(net: Linha, now: number): void {
    const session = net.current;
    for (const event of session?.bolas.splice(0) ?? []) {
      if (event.kind === EVENT.BOLA) {
        const [x = 0, z = 0, vx = 0, vz = 0, age = 0] = event.args;
        const state: Bola = { x, z, vx, vz, atMs: now - age };
        const had = this.drawn.get(event.subject);
        if (had) had.state = state;
        else this.drawn.set(event.subject, { state, body: this.make(), x: x / 1000, z: z / 1000 });
      } else if (event.kind === EVENT.GOLO) {
        const teu = event.subject === session?.me;
        this.golo = { nome: session?.who(event.subject)?.name ?? "", n: event.args[1] ?? 1, teu, ate: now + 5000 };
        for (const listener of this.listeners) listener();
      }
    }
    if (this.golo && this.golo.ate < now) {
      this.golo = null;
      for (const listener of this.listeners) listener();
    }
    const probe: { x: number; z: number; moving: boolean }[] = [];
    for (const one of this.drawn.values()) {
      const at = bolaAt(one.state, now);
      const x = at.x / 1000;
      const z = at.z / 1000;
      // It turns as it rolls: about the axis across the way it goes, by the ground it has covered.
      const dx = x - one.x;
      const dz = z - one.z;
      const far = Math.hypot(dx, dz);
      if (far > 0.0005) one.body.rotateOnWorldAxis(AXIS.set(dz / far, 0, -dx / far), far / RADIUS_M);
      one.body.position.set(x, RADIUS_M, z);
      one.x = x;
      one.z = z;
      probe.push({ x, z, moving: Math.hypot(at.vx, at.vz) > 50 });
    }
    window.__bola = { balls: probe, golo: this.golo ? { nome: this.golo.nome, n: this.golo.n } : null };
  }

  close(): void {
    for (const one of this.drawn.values()) one.body.removeFromParent();
    this.drawn.clear();
    for (const thing of [this.white, this.dark, this.round, this.patch]) thing.dispose();
  }
}

const AXIS = new Vector3();

/** A goal, said over the street to whoever is near. */
export function Ui({ bolas }: { bolas: Bolas }) {
  const [, redraw] = useState(0);
  useEffect(() => bolas.listen(() => redraw((n) => n + 1)), [bolas]);
  const golo = bolas.golo;
  if (!golo) return null;
  return (
    <div class="andar-net">
      <Banner state="done">{golo.teu ? tr.t("campo.golo.teu", { n: golo.n }) : tr.t("campo.golo", { nome: golo.nome, n: golo.n })}</Banner>
    </div>
  );
}
