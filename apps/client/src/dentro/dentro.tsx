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
//
// The family's house is one of these places (D-5.8), and the only one that is the player's alone: casa.ts hangs the
// bairro's doors, sets the inside of the player's own house in it, and says when it is there to be gone into.

import { ptAOTranslator as tr, type MessageKey } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { Button } from "@nzila/ui";
import { Vector3, type Object3D, type PerspectiveCamera } from "three";
import { useEffect, useState } from "preact/hooks";
import { Casas, type Bairro, type Cena, type Rede } from "./casa.ts";
// For a page that draws a bairro without a player in it (the team's scenes): the doors are hung there too.
export { Casas };
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
    /** For the tests: the place the player is inside of, how it is seen, and where the camera stands; the player's own house here, and how far its door stands open (0 to 1). */
    __dentro?: { onde: string | null; vista: Vista; sentado: boolean; camera: [number, number, number]; casa?: { house: number; door: readonly [number, number]; wake: readonly [number, number] } | null; porta?: number; olhar?: number; aviso?: string | null; aberta?: boolean };
  }
}

/** What the street's page lends each frame: its camera, and a way to cut the world off above a height. */
export interface Quadro extends Cena {
  readonly camera: PerspectiveCamera;
  cut(planes: unknown[]): void;
}

/** The player, as the street's page has them this frame. */
export interface Eu {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * The street's own camera: where the thumb has turned the view (the camera stands this way from the player), and
   * tilted it. Radians. Turned here once, for someone who wakes at home: they wake looking at their door.
   */
  readonly cam: { yaw: number; pitch: number; face?: number | undefined };
  /** 0 standing to 1 seated. */
  readonly sit: number;
  readonly height: number;
  readonly body: Object3D;
  /** The line to the zone; null walking alone. */
  readonly net: Rede | null;
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
  private readonly lugares: Lugar[];
  private readonly casas: Casas;
  private readonly vistas = kept();
  // A plane as the renderer reads one: which way is kept, and up to where. Not three's own Plane: the way in would
  // have to carry that class for every phone, and this is all of it that is read.
  private readonly plane = { normal: new Vector3(0, -1, 0), constant: 0 };
  private cutting = false;
  /** The picture before this one: whether the player's house was known, whether they stood in it, and where they stood. */
  private was = { known: false, at: false, x: 0, z: 0 };
  onde: Lugar | null = null;
  sentado = false;
  /** What is said under the wallet now: it is late and the player is not at home, or their house is in another bairro. A key of the words, or null. */
  aviso: string | null = null;
  /** The bairro the player's house is in, as its pack names it, when it is not this one. */
  get longe(): string | null {
    return this.casas.longe;
  }
  /** Whether the player stands at their own door, and whether it is open. */
  get porta(): { perto: boolean; aberta: boolean } {
    return { perto: this.casas.perto, aberta: this.casas.destrancada };
  }
  private net: Rede | null = null;
  private said = "";
  private since = performance.now();
  /** A hand to the door. */
  mexer(): void {
    this.casas.porta(this.net);
  }
  private readonly listeners = new Set<() => void>();

  constructor(bairro: Bairro & { readonly manifest: { readonly insides?: readonly Lugar[] | undefined } }) {
    this.lugares = [...(bairro.manifest.insides ?? [])];
    // The player's own house is a place that is gone into, from the moment its inside is there.
    this.casas = new Casas(bairro, (casa) => this.lugares.push(casa));
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
    this.net = eu.net;
    this.casas.frame(quadro, eu.x, eu.z, eu.net);
    const casa = this.casas.casa;
    // Put inside their house, not walked into it (they woke there: the zone set them down, or the house was only
    // now known to be theirs): they are turned to their door, and the camera goes behind them, so that what they see
    // is the door and the light of their windows, not a bare wall. The thumb turns it from there.
    const at = casa !== null && eu.x > casa.rect[0] && eu.x < casa.rect[2] && eu.z > casa.rect[1] && eu.z < casa.rect[3];
    if (casa && at && !this.was.at && (!this.was.known || Math.hypot(eu.x - this.was.x, eu.z - this.was.z) > 2)) {
      eu.cam.yaw = casa.look;
      eu.cam.face = casa.look + Math.PI;
    }
    this.was = { known: casa !== null, at, x: eu.x, z: eu.z };
    // Late, and not at home: the family worries, and says why (D-5.9). Early in a visit to a bairro that is not
    // theirs, where home is, said once for a quarter of a minute.
    const fresh = performance.now() - this.since < 15_000;
    this.aviso = this.casas.tem && this.casas.tarde && !at ? (this.casas.longe ? "dentro.tarde.longe" : "dentro.tarde") : this.casas.longe && fresh ? "dentro.longe" : null;
    const home = { casa, porta: this.casas.aberta, olhar: eu.cam.yaw, aviso: this.aviso, aberta: this.casas.destrancada };
    const saying = `${this.aviso}|${this.casas.perto}|${this.casas.destrancada}`;
    if (saying !== this.said) {
      this.said = saying;
      for (const listener of this.listeners) listener();
    }
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
      window.__dentro = { vista, sentado, camera: [0, 0, 0], ...window.__dentro, onde: null, ...home };
      return false;
    }
    const camera = quadro.camera;
    const backX = Math.sin(eu.cam.yaw);
    const backZ = Math.cos(eu.cam.yaw);
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
      const tilt = (0.2 - eu.cam.pitch) * 0.9;
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
      camera.position.set(eu.x + backX * room, eyes + Math.sin(eu.cam.pitch) * room * 0.6, eu.z + backZ * room);
      camera.lookAt(eu.x - backX * 1.5, eyes - 0.15 - Math.sin(eu.cam.pitch) * 0.6, eu.z - backZ * 1.5);
    }
    window.__dentro = { onde: onde.id, vista, sentado, camera: [camera.position.x, camera.position.y, camera.position.z], ...home };
    return true;
  }
}

/**
 * What being inside, and having a home, put on the screen: the button that changes the view (inside a place), the
 * hand to one's own door (standing at it), and what the family says when it is late or home is far.
 */
export function Ui({ dentro }: { dentro: Dentro }) {
  const [, redraw] = useState(0);
  useEffect(() => dentro.listen(() => redraw((n) => n + 1)), [dentro]);
  const vista = dentro.vista;
  const porta = dentro.porta;
  return (
    <>
      <div class="dentro-vista">
        {dentro.onde?.id === "casa" ? <p>{tr.t("dentro.casa")}</p> : null}
        {dentro.onde ? (
          <Button kind="quiet" onPress={() => dentro.mudar()}>
            {tr.t(vista === "porta" ? "dentro.vista.porta" : vista === "cima" ? "dentro.vista.cima" : "dentro.vista.olhos")}
          </Button>
        ) : null}
        {dentro.onde && vista === "olhos" && !dentro.sentado ? <p role="status">{tr.t("dentro.olhos.senta")}</p> : null}
        {dentro.aviso ? (
          <p role="status" class="dentro-aviso">
            {tr.t(dentro.aviso as MessageKey, { em: dentro.longe ? tr.t(`origin.bairro.${dentro.longe}.em` as MessageKey) : "" })}
          </p>
        ) : null}
      </div>
      {porta.perto ? (
        <div class="dentro-porta">
          <Button onPress={() => dentro.mexer()}>{tr.t(porta.aberta ? "dentro.porta.fechar" : "dentro.porta.abrir")}</Button>
        </div>
      ) : null}
    </>
  );
}
