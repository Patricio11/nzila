// Things in the house, on this phone (Task 5.3, D-5.11). What the player has set down in their own house is said
// whole by the zone whenever it changes; each thing is drawn where it stands, on the cells of the house's own plan,
// and where it stands the player does not walk. Standing in their house they set a thing down out of the Mochila
// where they stand looking ("Pôr aqui"), turn the thing before them, or take it up again. The phone asks; the zone
// decides, and says what is so.
//
// Part of being inside (dentro.tsx), and fetched with it.

import { ptAOTranslator as tr, type MessageKey } from "@nzila/i18n";
import { EVENT, type WorldEvent } from "@nzila/protocol";
import { MOVEL_RECUSAS, encodeMovel } from "@nzila/protocol/casa";
import { Button } from "@nzila/ui";
import { cellsOf, homeSeats, mayStand, type Holds, type HomeKind, type HomeSite, type SetDown } from "@nzila/world/casas";
import { BufferAttribute, BufferGeometry, Mesh, Quaternion, Vector3, type Material, type MeshLambertMaterial, type Object3D } from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useEffect, useState } from "preact/hooks";
import { meteredFetch } from "../net/data-meter.ts";
import { askAsPlayer } from "../world/account.ts";

const CASAS = "/packs/casas/";
/** How far before the player a thing is set down, from their feet to its near side; and how near one is to be the thing before them. Metres. */
const AHEAD_M = 0.75;
const NEAR_M = 1.5;
/** What is on the television: the paints its screen goes through, and how long each is on it. A picture that moves, and no more than that yet. */
const NO_ECRA = ["glassBlue", "muralPink", "flagYellow", "muralGreen", "paintWhite", "zincBlue"] as const;
const CADA_MS = 700;

/** A thing set down, as the zone says it. */
export interface Movel extends Holds {
  readonly id: number;
  readonly item: string;
}

/** A place to sit, as the street's page keeps them (the pack's seats): it offers the gold button at each, and seats whoever takes it. */
export interface Assento {
  id: string;
  pos: [number, number, number];
  facing: number;
}

/** What the pack of homes says of a thing to furnish with. */
interface Sort {
  readonly id: string;
  readonly model: string;
  readonly chao: readonly [number, number];
  readonly lugares?: number;
}

interface Rede {
  post(bytes: Uint8Array): void;
}

declare global {
  interface Window {
    /** For the tests: what is set down in the player's house, what they carry to furnish with, and what was last said of an asking. */
    __moveis?: { postos: { id: number; item: string; cx: number; cz: number; rot: number; x: number; z: number }[]; levo: string[]; dito: string | null; frente: number | null; assentos: { x: number; z: number; deita: boolean }[]; deitado: boolean };
  }
}

export class Moveis {
  /** What is set down, as last said whole. */
  postos: Movel[] = [];
  /** What of it the player carries in the Mochila, to set down. */
  levo: string[] = [];
  /** What was last said of an asking that was not done: a key of the words. */
  dito: string | null = null;
  /** The thing before the player, near enough to turn or take up. */
  frente: Movel | null = null;
  private coming: Movel[] = [];
  private readonly drawn = new Map<number, { thing: Movel; model: Object3D | null }>();
  private readonly models = new Map<string, Promise<Object3D | null>>();
  private readonly sorts = new Map<string, Sort>();
  private under = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private net: Rede | null = null;
  /** The player, in the house's own plan: where they stand and the way they look. Metres. */
  private eu = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly casa: Object3D;
  private readonly kind: HomeKind;
  private readonly paint: MeshLambertMaterial;
  private readonly site: HomeSite;
  /** The bairro's seats, as the street's page reads them each picture: the house's own are kept at their end. */
  private readonly assentos: Assento[];
  private readonly doBairro: number;
  /** Where one lies in the house (a bed, a mattress, the esteira): metres. */
  private camas: { x: number; y: number; z: number }[] = [];
  /** Whether the player lies down now. */
  deitado = false;
  /** Whether the list of the hand's work is open on the screen. */
  aberto = false;
  /** The televisions' screens, each a small picture of its own that changes. */
  private readonly ecras: BufferAttribute[] = [];
  private readonly ecra: MeshLambertMaterial;
  private readonly paints: Readonly<Record<string, readonly [number, number]>>;
  /** The player's body as it stands at rest: every bone's turn, to lay it out straight on a bed. */
  private readonly rest = new Map<Object3D, Quaternion>();
  private stood = { x: 0, z: 0 };
  private on = -1;

  /**
   * `casa`: the inside of the player's house as it stands in the bairro: things are set in it, in its own plan.
   * `assentos`: the bairro's own list of seats; the house's are added to it, so that a chair at home is sat on as a
   * bench in the street is (the gold button, the seated body, one's own eyes: D-0.41), and the zone counts them the same way.
   */
  constructor(casa: Object3D, site: HomeSite, kind: HomeKind, paint: MeshLambertMaterial, sorts: readonly Sort[], assentos: Assento[], paints: Readonly<Record<string, readonly [number, number]>> = {}) {
    this.paints = paints;
    // The screen lights itself: the palette's own colours, by day and by night.
    this.ecra = paint.clone();
    this.ecra.emissiveMap = this.ecra.map;
    this.ecra.emissive.setRGB(1, 1, 1);
    this.ecra.emissiveIntensity = 0.9;
    this.casa = casa;
    this.site = site;
    this.kind = kind;
    this.paint = paint;
    this.assentos = assentos;
    this.doBairro = assentos.length;
    for (const sort of sorts) this.sorts.set(sort.id, sort);
    this.seat();
    void this.carried();
  }

  /** The house's seats, after the bairro's own: the esteira, then what is set down that holds a body, in its order. */
  private seat(): void {
    const seats = homeSeats(this.site, this.kind, this.postos);
    this.assentos.length = this.doBairro;
    for (const [n, one] of seats.entries()) this.assentos.push({ id: `casa-${n}`, pos: one.pos, facing: one.facing });
    this.camas = seats.filter((one) => one.deita).map((one) => ({ x: one.pos[0], y: one.pos[1], z: one.pos[2] }));
    this.vistos = seats.map((one) => ({ x: one.pos[0], z: one.pos[2], deita: one.deita }));
  }
  private vistos: { x: number; z: number; deita: boolean }[] = [];

  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private tell(): void {
    const cell = this.kind.cellMm / 1000;
    const middle = (thing: Movel): Vector3 => {
      const [wide, deep] = thing.rot % 2 === 1 ? [thing.chao[1], thing.chao[0]] : thing.chao;
      return this.casa.localToWorld(new Vector3((thing.cx + wide / 2) * cell, 0, (thing.cz + deep / 2) * cell));
    };
    window.__moveis = { postos: this.postos.map((thing) => ({ id: thing.id, item: thing.item, cx: thing.cx, cz: thing.cz, rot: thing.rot, x: middle(thing).x, z: middle(thing).z })), levo: this.levo, dito: this.dito, frente: this.frente?.id ?? null, assentos: this.vistos, deitado: this.deitado };
    for (const listener of this.listeners) listener();
  }

  /** Whether a cell of the house's plan has a thing on it: the player's own ground asks. */
  taken = (cx: number, cz: number): boolean => this.under.has(`${cx},${cz}`);

  /** What the player carries that a house is furnished with. */
  private async carried(): Promise<void> {
    const { answer } = await askAsPlayer<{ items: { item: string; quantity: number }[] }>("GET", "/v1/me/items");
    this.levo = (answer?.items ?? []).filter((one) => this.sorts.has(one.item)).map((one) => one.item);
    this.tell();
  }

  /** What the zone said: one thing of the list at a time, the list complete at its last. */
  hear(event: WorldEvent): void {
    if (event.kind !== EVENT.MOVEIS) return;
    const [cx = 0, cz = 0, rot = 0, n = 0, count = 0, why = 0] = event.args;
    if (n === 0) this.coming = [];
    const sort = this.sorts.get(event.text);
    if (count > 0 && sort) this.coming.push({ id: event.subject, item: event.text, cx, cz, rot, chao: sort.chao, lugares: sort.lugares });
    if (count > 0 && n < count - 1) return;
    this.postos = this.coming;
    this.under = new Set(this.postos.flatMap(cellsOf).map(([x, z]) => `${x},${z}`));
    const refused = MOVEL_RECUSAS[why] ?? "";
    this.dito = refused ? `moveis.recusa.${refused}` : null;
    this.seat();
    this.draw();
    void this.carried();
    this.tell();
  }

  /** Each thing where it stands: set in the house's own plan, on the middle of the cells it stands on, turned by quarters. */
  private draw(): void {
    const cell = this.kind.cellMm / 1000;
    for (const [id, one] of this.drawn) {
      if (this.postos.some((thing) => thing.id === id)) continue;
      if (one.model) this.casa.remove(one.model);
      this.drawn.delete(id);
    }
    for (const thing of this.postos) {
      const had = this.drawn.get(thing.id);
      const place = (model: Object3D): void => {
        const [wide, deep] = thing.rot % 2 === 1 ? [thing.chao[1], thing.chao[0]] : thing.chao;
        model.position.set((thing.cx + wide / 2) * cell, this.kind.floor, (thing.cz + deep / 2) * cell);
        model.rotation.y = (thing.rot * Math.PI) / 2;
      };
      if (had) {
        had.thing = thing;
        if (had.model) place(had.model);
        continue;
      }
      const entry: { thing: Movel; model: Object3D | null } = { thing, model: null };
      this.drawn.set(thing.id, entry);
      void this.model(thing.item).then((made) => {
        // Taken up while its model was on its way: nothing to set.
        if (!made || this.drawn.get(thing.id) !== entry) return;
        entry.model = made.clone();
        if (thing.item === "televisao") this.screen(entry.model);
        place(entry.model);
        this.casa.add(entry.model);
        place(entry.model);
        // Where it now is: it may have been moved while it was fetched.
        const now = entry.thing;
        const [wide, deep] = now.rot % 2 === 1 ? [now.chao[1], now.chao[0]] : now.chao;
        entry.model.position.set((now.cx + wide / 2) * cell, this.kind.floor, (now.cz + deep / 2) * cell);
        entry.model.rotation.y = (now.rot * Math.PI) / 2;
      });
    }
  }

  /** A television's screen: a small lit picture set a hair before the set's own glass. */
  private screen(set: Object3D): void {
    const [w, h, y, z] = [0.42, 0.24, 0.84, 0.032];
    const picture = new BufferGeometry();
    picture.setAttribute("position", new BufferAttribute(new Float32Array([-w, y - h, z, w, y - h, z, w, y + h, z, -w, y - h, z, w, y + h, z, -w, y + h, z]), 3));
    picture.setAttribute("normal", new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    const uv = new BufferAttribute(new Float32Array(12), 2);
    picture.setAttribute("uv", uv);
    this.ecras.push(uv);
    set.add(new Mesh(picture, this.ecra));
  }

  /** A thing's model, fetched the first time one of its kind is seen and kept. */
  private model(item: string): Promise<Object3D | null> {
    let made = this.models.get(item);
    if (!made) {
      made = meteredFetch(CASAS + this.sorts.get(item)!.model)
        .then((bytes) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, ""))
        .then(
          (gltf) => {
            gltf.scene.traverse((node) => {
              const mesh = node as Object3D & { isMesh?: boolean; material?: Material };
              if (!mesh.isMesh) return;
              mesh.material?.dispose();
              mesh.material = this.paint;
            });
            return gltf.scene as Object3D;
          },
          () => null,
        );
      this.models.set(item, made);
    }
    return made;
  }

  /**
   * Lying down (D-5.12). The street's page seats whoever takes a seat; on a bed, a mattress or the esteira the
   * seated body is laid out here: every bone as it stands at rest, and the whole of it turned onto its back, its head
   * to the head of the bed. Done after the page has posed the body, each picture.
   */
  private lay(body: Object3D, x: number, z: number, sit: number): void {
    if (sit === 0 && Math.hypot(x - this.stood.x, z - this.stood.z) < 0.001) {
      body.traverse((node) => {
        if ((node as Object3D & { isBone?: boolean }).isBone) this.rest.set(node, (this.rest.get(node) ?? new Quaternion()).copy(node.quaternion));
      });
    }
    this.stood = { x, z };
    const bed = sit > 0.5 ? this.camas.find((one) => Math.hypot(one.x - x, one.z - z) < 0.5) : undefined;
    const lying = bed !== undefined;
    body.rotation.order = "YXZ";
    body.rotation.x = lying ? -Math.PI / 2 : 0;
    if (lying) {
      for (const [bone, turn] of this.rest) bone.quaternion.copy(turn);
      // Turned about its feet, it lies from them back: set so that its middle is the bed's, on top of it. Set, not
      // moved: the page does not put a seated body back each picture.
      body.position.set(bed.x + Math.sin(body.rotation.y) * 0.85, bed.y + 0.1, bed.z + Math.cos(body.rotation.y) * 0.85);
    }
    if (lying !== this.deitado) {
      this.deitado = lying;
      this.tell();
    }
  }

  /** Each picture: where the player is in the house's own plan, and which thing is before them. */
  frame(net: Rede | null, x: number, y: number, z: number, facing: number, inside: boolean, body: Object3D, sit: number): void {
    this.net = net;
    this.lay(body, x, z, sit);
    // What is on: the same on every set of the house, changing as a programme does.
    const now = Math.floor(performance.now() / CADA_MS) % NO_ECRA.length;
    if (now !== this.on) {
      this.on = now;
      const [u, v] = this.paints[NO_ECRA[now]!] ?? [0, 0];
      for (const uv of this.ecras) {
        for (let n = 0; n < uv.count; n++) uv.setXY(n, u, v);
        uv.needsUpdate = true;
      }
    }
    if (!inside) {
      if (this.frente) {
        this.frente = null;
        this.tell();
      }
      return;
    }
    const at = this.casa.worldToLocal(new Vector3(x, y, z));
    const ahead = this.casa.worldToLocal(new Vector3(x + Math.sin(facing), y, z + Math.cos(facing)));
    const far = Math.hypot(ahead.x - at.x, ahead.z - at.z) || 1;
    this.eu = { x: at.x, z: at.z, dx: (ahead.x - at.x) / far, dz: (ahead.z - at.z) / far };
    // The thing beside them: the nearest within reach of a hand, whichever way they look (one gets up from a chair with one's back to it).
    const cell = this.kind.cellMm / 1000;
    let best: Movel | null = null;
    let nearest = NEAR_M;
    for (const thing of this.postos) {
      const [wide, deep] = thing.rot % 2 === 1 ? [thing.chao[1], thing.chao[0]] : thing.chao;
      const [mx, mz] = [(thing.cx + wide / 2) * cell - at.x, (thing.cz + deep / 2) * cell - at.z];
      const reach = Math.hypot(mx, mz) - Math.max(wide, deep) * cell * 0.5;
      if (reach < nearest) [best, nearest] = [thing, reach];
    }
    if (best?.id !== this.frente?.id) {
      this.frente = best;
      this.tell();
    }
  }

  /** Where a thing of this floor would stand, set down before the player, its front to them. */
  private before(chao: readonly [number, number]): SetDown {
    const cell = this.kind.cellMm / 1000;
    const { x, z, dx, dz } = this.eu;
    // Its front (the model's +Z) looks back at the player: the quarter nearest to that.
    const alongX = Math.abs(dx) > Math.abs(dz);
    const rot = alongX ? (dx > 0 ? 3 : 1) : dz > 0 ? 2 : 0;
    const [wide, deep] = rot % 2 === 1 ? [chao[1], chao[0]] : chao;
    const out = AHEAD_M + ((alongX ? wide : deep) * cell) / 2;
    return { cx: Math.round((x + dx * out) / cell - wide / 2), cz: Math.round((z + dz * out) / cell - deep / 2), rot, chao };
  }

  private ask(asked: Parameters<typeof encodeMovel>[0], where: SetDown | null, moved: Movel | null): void {
    // Not offered what would be refused: the same rule the zone asks, asked here first.
    if (where && !mayStand(this.kind, this.postos.filter((one) => one !== moved), where)) {
      this.dito = "moveis.recusa.lugar";
      return this.tell();
    }
    this.dito = null;
    this.net?.post(encodeMovel(asked));
    this.tell();
  }

  /** Sets one of what is carried down before the player. */
  por(item: string): void {
    const sort = this.sorts.get(item);
    if (!sort) return;
    const where = this.before(sort.chao);
    this.ask({ op: "por", id: 0, item, cx: where.cx, cz: where.cz, rot: where.rot }, where, null);
  }

  /** Turns the thing before the player a quarter, where it stands (about the cell it begins at). */
  rodar(): void {
    const thing = this.frente;
    if (!thing) return;
    const where = { ...thing, rot: (thing.rot + 1) % 4 };
    this.ask({ op: "mudar", id: thing.id, item: thing.item, cx: where.cx, cz: where.cz, rot: where.rot }, where, thing);
  }

  /** Takes the thing before the player up into the Mochila. */
  guardar(): void {
    const thing = this.frente;
    if (thing) this.ask({ op: "guardar", id: thing.id, item: thing.item, cx: thing.cx, cz: thing.cz, rot: thing.rot }, null, thing);
  }
}

/** The hand's work in the house: what is carried to set down, and the thing before the player to turn or take up. */
export function Painel({ moveis }: { moveis: Moveis }) {
  const [, redraw] = useState(0);
  // Whether the list is open is the house's to remember, not this drawing of it: it stays open while the player
  // sits down, looks from above and comes back.
  const open = moveis.aberto;
  const setOpen = (next: boolean): void => {
    moveis.aberto = next;
    redraw((n) => n + 1);
  };
  useEffect(() => moveis.listen(() => redraw((n) => n + 1)), [moveis]);
  const kinds = [...new Set(moveis.levo)];
  if (kinds.length === 0 && !moveis.frente) return null;
  return (
    <div class="dentro-moveis">
      <Button kind="quiet" onPress={() => setOpen(!open)}>
        {tr.t("moveis.titulo")}
      </Button>
      {open ? (
        <div class="dentro-moveis-lista n-on-dark">
          {moveis.frente ? (
            <p>
              <b>{tr.t(`item.${moveis.frente.item}` as MessageKey)}</b>
              <Button kind="quiet" onPress={() => moveis.rodar()}>
                {tr.t("moveis.rodar")}
              </Button>
              <Button kind="quiet" onPress={() => moveis.guardar()}>
                {tr.t("moveis.guardar")}
              </Button>
            </p>
          ) : null}
          {kinds.map((item) => (
            <Button onPress={() => moveis.por(item)}>{tr.t("moveis.por", { coisa: tr.t(`item.${item}` as MessageKey) })}</Button>
          ))}
          {moveis.dito ? <p role="status">{tr.t(moveis.dito as MessageKey)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
