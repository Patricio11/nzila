// Being inside (Phase 5, D-0.41 and D-5.7). A place that is gone into stands in the street where it stands: the
// player walks in at its door, and nothing is loaded. This is how it is seen once inside, three ways, with one
// button between them, remembered for each place on this phone:
//
//   porta   at eye level, from just behind the shoulder, as the player came in at the door
//   cima    cut away from above: the roof off, the room and everyone in it seen whole (to furnish, to see a gathering)
//   olhos   seated, through the player's own eyes: the room, the others, and the street through the window
//
// The street's page asks this for the camera each frame, and takes its own when this has nothing to say (outside,
// or riding). Fetched the first time the player stands in a bairro that has such places: the way in is full (F-270).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { Button } from "@nzila/ui";
import { Vector3, type Object3D, type PerspectiveCamera } from "three";
import { useEffect, useState } from "preact/hooks";
import "./dentro.css";

// The words of this came with it.
tr.extend(ptAOLater);

/** A place that is gone into, as the pack says it: metres. */
export interface Lugar {
  readonly id: string;
  readonly rect: readonly [number, number, number, number];
  readonly height: number;
}

export const VISTAS = ["porta", "cima", "olhos"] as const;
export type Vista = (typeof VISTAS)[number];

declare global {
  interface Window {
    /** For the tests: the place the player is inside of, how it is seen, and where the camera stands. */
    __dentro?: { onde: string | null; vista: Vista; sentado: boolean; camera: [number, number, number] };
  }
}

/** What the street's page lends each frame: its camera, and a way to cut the world off above a height. */
export interface Quadro {
  readonly camera: PerspectiveCamera;
  cut(planes: unknown[]): void;
}

/** The player, as the street's page has them this frame. */
export interface Eu {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Where the thumb has turned the view (the camera stands this way from the player), and tilted it. Radians. */
  readonly yaw: number;
  readonly pitch: number;
  /** 0 standing to 1 seated. */
  readonly sit: number;
  readonly height: number;
  readonly body: Object3D;
}

const KEY = "nzila.dentro";
const kept = (): Record<string, Vista> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Vista>;
  } catch {
    return {};
  }
};

/** How far behind the shoulder the camera stands at eye level, and how near a wall it may come. Metres. */
const BEHIND_M = 2.3;
const FROM_WALL_M = 0.3;
/** From above: how high at most (a small room is seen from nearer), and how far back from straight over the head. */
const ABOVE_M = 8.5;
const ABOVE_BACK_M = 3.4;

export class Dentro {
  private readonly lugares: readonly Lugar[];
  private readonly vistas = kept();
  // A plane as the renderer reads one: which way is kept, and up to where. Not three's own Plane: the way in would
  // have to carry that class for every phone, and this is all of it that is read.
  private readonly plane = { normal: new Vector3(0, -1, 0), constant: 0 };
  private cutting = false;
  onde: Lugar | null = null;
  sentado = false;
  private readonly listeners = new Set<() => void>();

  constructor(lugares: readonly Lugar[]) {
    this.lugares = lugares;
  }

  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  get vista(): Vista {
    return (this.onde && this.vistas[this.onde.id]) || "porta";
  }

  /** The next way of seeing this place; kept for the next time the player comes in. */
  mudar(): void {
    if (!this.onde) return;
    this.vistas[this.onde.id] = VISTAS[(VISTAS.indexOf(this.vista) + 1) % VISTAS.length]!;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.vistas));
    } catch {
      // Storage is off: it lasts for this visit.
    }
    for (const listener of this.listeners) listener();
  }

  /**
   * Places the camera for someone inside. False when the street's own camera is to be used: outside, or riding.
   */
  camera(quadro: Quadro, eu: Eu, riding: boolean): boolean {
    const onde = riding ? null : (this.lugares.find((one) => eu.x > one.rect[0] && eu.x < one.rect[2] && eu.z > one.rect[1] && eu.z < one.rect[3]) ?? null);
    const sentado = eu.sit > 0.9;
    if (onde !== this.onde || sentado !== this.sentado) {
      this.onde = onde;
      this.sentado = sentado;
      for (const listener of this.listeners) listener();
    }
    const vista = this.vista;
    const cut = onde !== null && vista === "cima";
    if (cut !== this.cutting) {
      this.cutting = cut;
      quadro.cut(cut ? [this.plane] : []);
    }
    if (!onde) {
      if (window.__dentro?.onde) window.__dentro = { ...window.__dentro, onde: null };
      return false;
    }
    const camera = quadro.camera;
    const backX = Math.sin(eu.yaw);
    const backZ = Math.cos(eu.yaw);
    if (vista === "cima") {
      // The roof off just under the top of the walls: the room, and whoever is in it, whole.
      this.plane.constant = eu.y + Math.min(onde.height, 2.4);
      const high = Math.min(ABOVE_M, 4.2 + Math.max(onde.rect[2] - onde.rect[0], onde.rect[3] - onde.rect[1]) * 0.36);
      camera.position.set(eu.x + backX * ABOVE_BACK_M, eu.y + high, eu.z + backZ * ABOVE_BACK_M);
      camera.lookAt(eu.x, eu.y + 0.9, eu.z);
    } else if (vista === "olhos" && sentado) {
      // Through the player's own eyes: their own body is not in the way of them.
      eu.body.visible = false;
      const eyes = eu.y + eu.height * 0.64;
      const tilt = (0.2 - eu.pitch) * 0.9;
      camera.position.set(eu.x, eyes, eu.z);
      camera.lookAt(eu.x - backX * Math.cos(tilt), eyes + Math.sin(tilt), eu.z - backZ * Math.cos(tilt));
    } else {
      // At eye level, behind the shoulder: as far back as the room lets it be, never through a wall.
      let room = BEHIND_M;
      if (backX > 0.001) room = Math.min(room, (onde.rect[2] - eu.x) / backX - FROM_WALL_M);
      if (backX < -0.001) room = Math.min(room, (onde.rect[0] - eu.x) / backX - FROM_WALL_M);
      if (backZ > 0.001) room = Math.min(room, (onde.rect[3] - eu.z) / backZ - FROM_WALL_M);
      if (backZ < -0.001) room = Math.min(room, (onde.rect[1] - eu.z) / backZ - FROM_WALL_M);
      room = Math.max(0.05, room);
      // Too near a wall for the body to be seen whole: seen through the eyes, for as long as that lasts.
      if (room < 0.75) eu.body.visible = false;
      const eyes = eu.y + eu.height * (0.9 - 0.24 * eu.sit);
      camera.position.set(eu.x + backX * room, eyes + Math.sin(eu.pitch) * room * 0.6, eu.z + backZ * room);
      camera.lookAt(eu.x - backX * 1.5, eyes - 0.15 - Math.sin(eu.pitch) * 0.6, eu.z - backZ * 1.5);
    }
    window.__dentro = { onde: onde.id, vista, sentado, camera: [camera.position.x, camera.position.y, camera.position.z] };
    return true;
  }
}

/** The button that changes the view, with the name of the view the player has. */
export function Ui({ dentro }: { dentro: Dentro }) {
  const [, redraw] = useState(0);
  useEffect(() => dentro.listen(() => redraw((n) => n + 1)), [dentro]);
  if (!dentro.onde) return null;
  const vista = dentro.vista;
  return (
    <div class="dentro-vista">
      <Button kind="quiet" onPress={() => dentro.mudar()}>
        {tr.t(vista === "porta" ? "dentro.vista.porta" : vista === "cima" ? "dentro.vista.cima" : "dentro.vista.olhos")}
      </Button>
      {vista === "olhos" && !dentro.sentado ? <p role="status">{tr.t("dentro.olhos.senta")}</p> : null}
    </div>
  );
}
