// Rides asked for, on this phone (Task 6.2, D-6.5): every moto-táxi, kupapata and táxi on the channel's roads, drawn
// where the zone has it (its leg, its start on the zone's clock, its speed), with its rider at the bars and whoever
// hired it on the seat behind; the gold button by it ("Apanhar" at the kerb, "Descer aqui" on the way); a chip that
// says where one's own ride is; and the asking, from the Mapa. Fetched the first time a ride is on the road or asked
// for: the way in is full (F-226).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { EVENT, HIRED_VEHICLE_BASE, type WorldEvent } from "@nzila/protocol";
import { CORRIDA_FASES, CORRIDA_KINDS, decodeCorridas, encodeCorrida, type CorridaKind, type CorridasSaid } from "@nzila/protocol/corridas";
import { CELL_DRIVE, CELL_WALK, groundHeight, type Ground } from "@nzila/sim";
import { Button } from "@nzila/ui";
import { alongPath } from "@nzila/world/estrada";
import { Mesh, type BufferGeometry, type Material, type Object3D } from "three";
import { useEffect, useState } from "preact/hooks";
import { meteredFetch } from "../net/data-meter.ts";
import { gltfLoader } from "../render/chunk-stream.ts";
import { type People } from "../render/people.ts";
import { type Person } from "../render/person.ts";
import { type WorldRenderer } from "../render/world-renderer.ts";
import { askAsPlayer } from "../world/account.ts";
import "./corrida.css";

// The words of this came with it.
tr.extend(ptAOLater);

const VEHICLES = "/packs/dev-vehicles/";
/** The model each kind of ride is drawn with. */
const MODEL: Readonly<Record<CorridaKind, string>> = { mota: "mota", kupapata: "kupapata", taxi: "taxi" };
/** How near a ride waiting at the kerb a player must stand for the gold button to offer it, in metres (inside the zone's 3,5). */
const BOARD_REACH_M = 3;
/** How quickly a ride's heading follows its road round a corner, in milliseconds. */
const TURN_MS = 260;

/** What the street page gives this: the line to the zone, as far as rides need it. */
export interface Linha {
  readonly current: { corridas: Uint8Array | null; pedidos: WorldEvent[]; post(bytes: Uint8Array): void; myRide: { vehicle: number; seat: number } | null } | null;
}

interface Model {
  readonly scene: Object3D;
  readonly seats: readonly { readonly who: string; readonly pos: readonly [number, number, number] }[];
}

interface Drawn {
  readonly body: Object3D;
  readonly kind: CorridaKind;
  /** Where whoever hired it sits, in its own axes. */
  readonly passenger: readonly [number, number, number];
  rider: Person | null;
  heading: number;
}

/** Every ride on the roads, drawn. */
export class Corridas {
  private readonly renderer: WorldRenderer;
  private readonly people: People | null;
  private readonly models = new Map<CorridaKind, Promise<Model | null>>();
  private readonly drawn = new Map<number, Drawn>();
  private readonly geometries: BufferGeometry[] = [];
  private listed: Promise<{ vehicles: { name: string; model: string; seats?: Model["seats"] }[] } | null> | null = null;
  /** The last that was said, and the zone's clock now. */
  private said: CorridasSaid | null = null;
  private bytes: Uint8Array | null = null;
  private lastMs = 0;
  /** One's own ride, as the zone last spoke of it; changed is when it last changed (performance.now()). */
  mine: Minha | null = null;

  constructor(renderer: WorldRenderer, people: People | null) {
    this.renderer = renderer;
    this.people = people;
  }

  private model(kind: CorridaKind): Promise<Model | null> {
    let loading = this.models.get(kind);
    if (!loading) {
      this.listed ??= meteredFetch(`${VEHICLES}veiculos.json`)
        .then((bytes) => JSON.parse(new TextDecoder().decode(bytes)) as { vehicles: { name: string; model: string; seats?: Model["seats"] }[] })
        .catch(() => null);
      loading = this.listed.then(async (listed) => {
        const entry = listed?.vehicles.find((one) => one.name === MODEL[kind]);
        if (!entry) return null;
        const scene = (await gltfLoader().parseAsync(await meteredFetch(VEHICLES + entry.model), "")).scene;
        scene.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          (node.material as Material).dispose();
          node.material = this.renderer.paletteMaterial;
          node.castShadow = true;
          node.receiveShadow = false;
          this.geometries.push(node.geometry as BufferGeometry);
        });
        return { scene, seats: entry.seats ?? [] };
      });
      this.models.set(kind, loading);
    }
    return loading;
  }

  /** What the zone says of one's own ride, read from the line; a ride not given, or called off, has its fare given back. */
  private hear(pedidos: WorldEvent[]): void {
    for (const event of pedidos.splice(0)) {
      if (event.kind === EVENT.CORRIDA) {
        const fase = CORRIDA_FASES[event.args[1] ?? 0] ?? "vem";
        const kind = CORRIDA_KINDS.find((one) => one === event.text);
        this.mine = { vehicle: event.args[0] ?? 0, kind: kind ?? this.mine?.kind ?? "mota", fase, fim: kind ? null : event.text };
      } else if (event.kind === EVENT.CORRIDA_RECUSADA) {
        this.mine = { vehicle: this.mine?.vehicle ?? 0, kind: this.mine?.kind ?? "mota", fase: "vai", fim: event.text };
        if (event.text === "sem_estrada" || event.text === "cancelada") void askAsPlayer("POST", "/v1/corridas/devolver");
      }
    }
  }

  /** Every ride where the zone's clock puts it now; a ride the zone no longer speaks of is taken away. */
  update(bytes: Uint8Array | null, pedidos: WorldEvent[], ground: Ground | null, zoneNowMs: number, elapsedMs: number, seconds: number): void {
    this.hear(pedidos);
    // Read once each time the zone speaks; a message that is not the rides is as if it had said none.
    if (bytes !== this.bytes) {
      this.bytes = bytes;
      try {
        this.said = bytes ? decodeCorridas(bytes) : null;
      } catch {
        this.said = null;
      }
    }
    const said = this.said;
    this.lastMs = zoneNowMs;
    const here = new Set<number>();
    for (const ride of said?.rides ?? []) {
      const kind = CORRIDA_KINDS[ride.kind];
      if (!kind) continue;
      here.add(ride.vehicle);
      const drawn = this.drawn.get(ride.vehicle);
      if (!drawn) {
        void this.place(ride.vehicle, kind);
        continue;
      }
      const at = alongPath(ride.path, ((zoneNowMs - ride.fromMs) * ride.speed) / 1000);
      const xMm = Math.round(at.x);
      const zMm = Math.round(at.z);
      const y = ground ? groundHeight(ground, xMm, zMm, CELL_DRIVE | CELL_WALK, 600) / 1000 : 0;
      drawn.heading += Math.atan2(Math.sin(at.heading - drawn.heading), Math.cos(at.heading - drawn.heading)) * Math.min(1, elapsedMs / TURN_MS);
      drawn.body.position.set(at.x / 1000, Number.isFinite(y) ? y : 0, at.z / 1000);
      drawn.body.rotation.y = drawn.heading;
      drawn.body.visible = true;
      drawn.rider?.pose({ speed: 0, phase: 0, time: seconds + ride.vehicle }, { sit: 1 });
    }
    for (const [vehicle, drawn] of this.drawn) {
      if (here.has(vehicle)) continue;
      drawn.body.removeFromParent();
      drawn.rider?.release();
      this.drawn.delete(vehicle);
    }
  }

  /** A ride's body, made once its model is here: the vehicle, and someone at the bars or the wheel. */
  private async place(vehicle: number, kind: CorridaKind): Promise<void> {
    if (this.drawn.has(vehicle)) return;
    const model = await this.model(kind);
    if (!model || this.drawn.has(vehicle)) return;
    const body = model.scene.clone();
    body.visible = false;
    this.renderer.scene.add(body);
    const drawn: Drawn = { body, kind, passenger: model.seats.find((one) => one.who === "passageiro")?.pos ?? PASSENGER[kind], rider: null, heading: 0 };
    this.drawn.set(vehicle, drawn);
    const seat = model.seats.find((one) => one.who === "condutor");
    const who = seat ? this.people?.pick("any", vehicle * 3 + 1) : undefined;
    if (seat && who && this.people) {
      const rider = await this.people.make(who);
      if (!rider) return;
      if (this.drawn.get(vehicle) !== drawn) return rider.release();
      rider.root.position.set(seat.pos[0], seat.pos[1] - 0.46 * (rider.height / 1.7), seat.pos[2]);
      rider.shadow = false;
      body.add(rider.root);
      drawn.rider = rider;
    }
  }

  /** The body a ride is drawn as, for the street to seat someone in it. */
  bodyAt(vehicle: number): Object3D | null {
    return this.drawn.get(vehicle)?.body ?? null;
  }

  /** Where whoever hired a ride sits on it, in its own axes. */
  seatAt(vehicle: number): readonly [number, number, number] | null {
    return this.drawn.get(vehicle)?.passenger ?? null;
  }

  /**
   * The player's own body, on their ride when they are on one: seated behind the rider, carried with the ride. True
   * while it is so; the street then leaves the body alone.
   */
  carry(person: Person, myRide: { vehicle: number } | null, seconds: number): boolean {
    const body = myRide && myRide.vehicle >= HIRED_VEHICLE_BASE ? this.bodyAt(myRide.vehicle) : null;
    const seat = body && myRide ? this.seatAt(myRide.vehicle) : null;
    if (!body || !seat) {
      if (person.root.parent && person.root.parent !== this.renderer.scene) this.renderer.scene.add(person.root);
      return false;
    }
    if (person.root.parent !== body) body.add(person.root);
    person.root.position.set(seat[0], seat[1] - 0.46 * (person.height / 1.7), seat[2]);
    person.root.rotation.y = 0;
    person.root.visible = true;
    person.pose({ speed: 0, phase: 0, time: seconds }, { sit: 1 });
    return true;
  }

  /** The gold button by a ride: "board" at the kerb by one's own ride waiting, "getOff" on it; or nothing. */
  action(myRide: { vehicle: number } | null, x: number, z: number): "board" | "getOff" | null {
    if (myRide && myRide.vehicle >= HIRED_VEHICLE_BASE) return "getOff";
    const ride = this.mine && !this.mine.fim ? this.said?.rides.find((one) => one.vehicle === this.mine!.vehicle) : undefined;
    if (!ride || CORRIDA_FASES[ride.fase] !== "espera") return null;
    const at = alongPath(ride.path, ((this.lastMs - ride.fromMs) * ride.speed) / 1000);
    return Math.hypot(at.x / 1000 - x, at.z / 1000 - z) < BOARD_REACH_M ? "board" : null;
  }

  /** One's own ride for the test page: what it is doing, how it ended, and where it is now (metres). */
  probe(): { fase: string; fim: string | null; x: number; z: number } | null {
    const mine = this.mine;
    if (!mine) return null;
    const ride = this.said?.rides.find((one) => one.vehicle === mine.vehicle);
    const at = ride ? alongPath(ride.path, ((this.lastMs - ride.fromMs) * ride.speed) / 1000) : null;
    return { fase: mine.fase, fim: mine.fim, x: at ? at.x / 1000 : -1, z: at ? at.z / 1000 : -1 };
  }

  /** The gold button pressed by a ride: on at the kerb, or off on the way. */
  act(net: Linha, what: "board" | "getOff"): void {
    net.current?.post(encodeCorrida({ op: what === "board" ? "subir" : "descer" }));
  }

  close(): void {
    for (const drawn of this.drawn.values()) {
      drawn.body.removeFromParent();
      drawn.rider?.release();
    }
    this.drawn.clear();
    for (const geometry of this.geometries) geometry.dispose();
  }
}

/** The passenger's seat when a pack's list does not say it (the same as `vehicles.py` writes). */
const PASSENGER: Readonly<Record<CorridaKind, readonly [number, number, number]>> = { mota: [0, 0.84, -0.55], kupapata: [0.44, 0.83, -0.5], taxi: [-0.38, 0.52, -0.7] };

/** A ride asked for from the Mapa: paid through the API, then asked of the zone by its id. What went wrong, if anything. */
export async function pedir(net: Linha, kind: CorridaKind, to: { x: number; z: number }): Promise<string | null> {
  const { answer, error } = await askAsPlayer<{ id: string }>("POST", "/v1/corridas", { kind, to: { x: Math.round(to.x * 1000), z: Math.round(to.z * 1000) } });
  if (!answer) return error ?? "failed";
  net.current?.post(encodeCorrida({ op: "pedir", id: answer.id }));
  return null;
}

/** The fares, as the API says them, for the Mapa to show before anything is asked. */
export async function precos(): Promise<Record<CorridaKind, number> | null> {
  return (await askAsPlayer<Record<CorridaKind, number>>("GET", "/v1/corridas/precos")).answer;
}

/** One's own ride, as the zone last spoke of it. */
export interface Minha {
  readonly vehicle: number;
  readonly kind: CorridaKind;
  readonly fase: (typeof CORRIDA_FASES)[number];
  /** How it ended, when it has: "chegou", "desceu", "foi_embora", "cancelada", "sem_estrada", "nao_paga", "ocupado". */
  readonly fim: string | null;
}

/** The chip of one's own ride: where it is, and how to call it off or get off. Gone a little after the ride ends. */
export function Chip({ net, corridas }: { net: Linha; corridas: Corridas }) {
  const [mine, setMine] = useState<Minha | null>(corridas.mine);
  const [hidden, setHidden] = useState<Minha | null>(null);
  useEffect(() => {
    const every = setInterval(() => setMine(corridas.mine), 200);
    return () => clearInterval(every);
  }, [corridas]);
  useEffect(() => {
    if (!mine?.fim) return;
    const later = setTimeout(() => setHidden(mine), 6000);
    return () => clearTimeout(later);
  }, [mine]);
  if (!mine || hidden === mine) return null;
  const what = tr.t(`corrida.${mine.kind}` as "corrida.mota");
  const line = mine.fim ? tr.t(`corrida.fim.${mine.fim}` as "corrida.fim.chegou", { what }) : tr.t(`corrida.fase.${mine.fase}` as "corrida.fase.vem", { what });
  return (
    <div class={`cd-chip cd-${mine.kind}${mine.fim ? " cd-fim" : ""}`} role="status">
      <span class="cd-icon" aria-hidden="true" />
      <p>{line}</p>
      {!mine.fim && mine.fase !== "vai" ? (
        <Button kind="quiet" onPress={() => net.current?.post(encodeCorrida({ op: "descer" }))}>
          {tr.t(mine.fase === "leva" ? "corrida.descer" : "corrida.cancelar")}
        </Button>
      ) : null}
    </div>
  );
}
