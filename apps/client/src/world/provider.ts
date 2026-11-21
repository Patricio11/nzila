// How the client reads the world (decision S-1). The pages and the Telemóvel
// ask a WorldProvider for what they show: the district, where the player is,
// what is on the road, the player's own settings. In Phase 1 the answers come
// from this device alone (`LocalWorld`); Phase 3 puts the network behind the
// same questions, and nothing that asks them changes.

import { type Manifest } from "@nzila/world/client";
import { dataMeter, meteredFetch } from "../net/data-meter.ts";
import { type DistrictScene } from "../render/district-scene.ts";
import { type TierName } from "../render/tiers.ts";
import { savedPhoto } from "../render/wardrobe.ts";
import { PANOS, wearPano, type MeuPano } from "./pano.ts";
import { account, refreshAccount, type Account, type Choices, type NameAnswer } from "./account.ts";

/** What the Telemóvel's account screens use, fetched the first time one is (F-226). */
const conta = (): Promise<typeof import("../telemovel/conta.ts")> => import("../telemovel/conta.ts");

/** Who the player is, as the BI shows it. */
export interface Me {
  /** "linked" once the BI is saved with a phone number. */
  readonly kind: Account["kind"] | undefined;
  readonly savedWith: Account["savedWith"] | undefined;
  readonly name: Account["name"] | undefined;
  readonly nameFree: boolean | undefined;
  readonly biNumber: string | undefined;
  readonly arrivedAt: string | undefined;
  readonly origin: Account["origin"] | undefined;
  /** The photograph taken in the look chooser, as an image address, when there is one. */
  readonly photo: string | null;
}

/** What a player has chosen for this device. */
export interface Settings {
  /** The quality of the picture. */
  readonly tier: TierName;
  /** Modo Poupança: the least data and the lightest picture, whatever else is chosen. */
  readonly poupanca: boolean;
  readonly sound: boolean;
  /** Left-handed: the stick on the right, the buttons on the left. */
  readonly leftHanded: boolean;
  /** The colourway of the cloth the interface wears: the player's own pano. */
  readonly pano: MeuPano;
}

/** The district as a map: one character a cell, north up (art/scripts/make_l1.py writes it). */
export interface DistrictMap {
  /** Metres a cell. */
  readonly cellM: number;
  /** "~" water, "=" road, "." where people walk, "#" what is built or planted. */
  readonly rows: readonly string[];
}

export interface MapLine {
  readonly id: string;
  /** [x, z] in metres, a closed line. */
  readonly points: readonly (readonly [number, number])[];
}

export interface WorldProvider {
  readonly settings: Settings;
  change(patch: Partial<Settings>): void;
  /** Calls `listener` when a setting changes. Returns the way to stop. */
  watch(listener: () => void): () => void;
  /** Megabytes are money: what this device has downloaded, this visit and this month. */
  dataUsed(): { session: number; month: number };
  /** The district the player is in, or null before they have arrived. */
  district(): Manifest | null;
  /** A word of the district, by key. */
  word(key: string): string;
  /** The district drawn as a map and the lines its vans run, fetched the first time they are asked for. */
  map(): Promise<{ map: DistrictMap | null; lines: MapLine[] }>;
  /** The channel of the district the player is in with others, or null when they walk alone. */
  channel(): number | null;
  /** The channel's number when it is worth saying: only when the bairro has more than one copy. */
  channelNamed(): number | null;
  /** Where the player is, in metres, and the way they face, in degrees clockwise from north. */
  you(): { x: number; z: number; heading: number } | null;
  /** Whether the player stands at a caixa, as this phone sees it: what the Banco offers. The zone decides for itself. */
  atCaixa(): boolean;
  /** The shop the player stands at, as this phone sees it: its place in the pack and its painted name. The zone decides for itself. */
  atShop(): { id: string; name: string } | null;
  /** The biscato whose place the player stands at (Task 4.5): its kind and the place's name. */
  atBiscato(): { kind: string; name: string } | null;
  /** Where the player stands, as the page last said (metres), or null before the street is open. */
  readonly player: { readonly x: number; readonly z: number } | null;
  /** The other players in the street, as far as this phone is told of them. */
  people(): { x: number; z: number }[];
  /** The vans on the road now. */
  vans(): { x: number; z: number }[];
  /** Who the player is, as far as is known here; null before anyone has come in. */
  me(): Me | null;
  /** Asks again who the player is, where there is someone to ask. */
  refreshMe(): Promise<Me | null>;
  /** Whether a name can be had; null when nobody can say. */
  askName(name: string): Promise<NameAnswer | null>;
  /** Takes a name: "ok", or the one word of why not. */
  rename(name: string): Promise<"ok" | "taken" | "refused" | "spent" | "invalid" | "offline">;
  /** What the player has said yes to (analytics, notifications); null when nobody can say. */
  choices(): Promise<Choices | null>;
  choose(purpose: keyof Choices, granted: boolean): Promise<Choices | null>;
  /** Everything kept of the player, to take away; null when it cannot be fetched. */
  exportData(): Promise<Record<string, unknown> | null>;
  /** Ends the account. True when it is gone. */
  deleteAccount(): Promise<boolean>;
}

const KEY = "nzila.settings";
const DEFAULTS: Settings = { tier: "normal", poupanca: false, sound: true, leftHanded: false, pano: "vermelho" };

function stored(): Partial<Settings> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    return {
      ...(value.tier === "poupanca" || value.tier === "normal" || value.tier === "alta" ? { tier: value.tier } : {}),
      ...(typeof value.poupanca === "boolean" ? { poupanca: value.poupanca } : {}),
      ...(typeof value.sound === "boolean" ? { sound: value.sound } : {}),
      ...(typeof value.leftHanded === "boolean" ? { leftHanded: value.leftHanded } : {}),
      ...(PANOS.some((pano) => pano === value.pano) ? { pano: value.pano as MeuPano } : {}),
    };
  } catch {
    return {};
  }
}

/** How near a caixa the Banco offers to bank: a little inside what the zone allows, so that an offer is never refused. */
export const CAIXA_REACH_M = 3;
/** A little inside the zone's own reach, so that what the phone offers the zone also allows. */
export const SHOP_REACH_M = 3;
/** The signs of shops, as the zone knows them. */
const SHOP_GLYPHS = ["cantina", "flores", "gelado"];

/** The world as this device alone knows it. */
export class LocalWorld implements WorldProvider {
  private current: Settings;
  private readonly listeners = new Set<() => void>();
  private scene: DistrictScene | null = null;
  private base = "";
  /** Where the player stands, as the page last said (metres): read by the hunger line and the compass's food mark. */
  player: { x: number; z: number; heading: number } | null = null;
  private among: number | null = null;
  private named: number | null = null;
  private company: { heads(): { x: number; z: number }[] } | null = null;
  private drawn: Promise<{ map: DistrictMap | null; lines: MapLine[] }> | null = null;

  /** `asked` is what the address of the page asked for, which wins over what was stored. */
  constructor(asked: Partial<Settings> = {}) {
    // `?pano=azul` in the address shows another pano, for stills.
    const shown = PANOS.find((pano) => pano === new URLSearchParams(location.search).get("pano"));
    this.current = { ...DEFAULTS, ...stored(), ...asked, ...(shown ? { pano: shown } : {}) };
    wearPano(this.current);
  }

  get settings(): Settings {
    return this.current;
  }

  change(patch: Partial<Settings>): void {
    this.current = { ...this.current, ...patch };
    wearPano(this.current);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.current));
    } catch {
      // Storage is off: the choice lasts for this visit only.
    }
    for (const listener of this.listeners) listener();
  }

  watch(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dataUsed(): { session: number; month: number } {
    return { session: dataMeter.session, month: dataMeter.month };
  }

  /** The page tells the world which district it has opened, and where it is served from. */
  enter(scene: DistrictScene, base: string): void {
    this.scene = scene;
    this.base = base;
    this.drawn = null;
  }

  /** The page tells the world where the player is, every frame. */
  place(x: number, z: number, heading: number): void {
    this.player = { x, z, heading };
  }

  /** Said by the walking page: which channel the zone has put the player in, or none. */
  inChannel(channel: number | null, company: { heads(): { x: number; z: number }[] } | null = null, named: number | null = null): void {
    this.among = channel;
    this.named = channel === null ? null : named;
    this.company = channel === null ? null : company;
  }

  channelNamed(): number | null {
    return this.named;
  }

  atCaixa(): boolean {
    const at = this.player;
    return at !== null && (this.scene?.manifest.pois ?? []).some((place) => place.glyph === "banco" && Math.hypot(place.pos[0] - at.x, place.pos[2] - at.z) < CAIXA_REACH_M);
  }

  atShop(): { id: string; name: string } | null {
    const at = this.player;
    const shop = at === null ? undefined : (this.scene?.manifest.pois ?? []).find((place) => SHOP_GLYPHS.includes(place.glyph ?? "") && Math.hypot(place.pos[0] - at.x, place.pos[2] - at.z) < SHOP_REACH_M);
    return shop ? { id: shop.id, name: this.word(shop.nameKey) } : null;
  }

  atBiscato(): { kind: string; name: string } | null {
    const at = this.player;
    const spot = at === null ? undefined : (this.scene?.manifest.pois ?? []).find((place) => /^(biscato|servico)-/.test(place.id) && Math.hypot(place.pos[0] - at.x, place.pos[2] - at.z) < SHOP_REACH_M);
    return spot ? { kind: spot.id.split("-")[1]!, name: this.word(spot.nameKey) } : null;
  }

  people(): { x: number; z: number }[] {
    return this.company?.heads() ?? [];
  }

  channel(): number | null {
    return this.among;
  }

  district(): Manifest | null {
    return this.scene?.manifest ?? null;
  }

  word(key: string): string {
    return this.scene?.word(key) ?? key;
  }

  map(): Promise<{ map: DistrictMap | null; lines: MapLine[] }> {
    if (!this.drawn) {
      const manifest = this.district();
      const read = async <T>(file: string): Promise<T> => JSON.parse(new TextDecoder().decode(await meteredFetch(this.base + file))) as T;
      this.drawn = !manifest
        ? Promise.resolve({ map: null, lines: [] })
        : Promise.all([
            manifest.map ? read<DistrictMap>(manifest.map).catch(() => null) : Promise.resolve(null),
            Promise.all(manifest.routes.map(async (route) => ({ id: route.id, points: (await read<{ points: [number, number, number][] }>(route.spline)).points.map(([x, , z]) => [x, z] as const) }))).catch(() => []),
          ]).then(([map, lines]) => ({ map, lines }));
    }
    return this.drawn;
  }

  you(): { x: number; z: number; heading: number } | null {
    return this.player;
  }

  vans(): { x: number; z: number }[] {
    return (this.scene?.traffic?.seen ?? []).map((van) => ({ x: van.x, z: van.z }));
  }

  me(): Me | null {
    const mine = account();
    return mine ? { kind: mine.kind, savedWith: mine.savedWith, name: mine.name, nameFree: mine.nameFree, biNumber: mine.biNumber, arrivedAt: mine.arrivedAt, origin: mine.origin, photo: savedPhoto() } : null;
  }

  async refreshMe(): Promise<Me | null> {
    await refreshAccount();
    return this.me();
  }

  askName(name: string): Promise<NameAnswer | null> {
    return conta().then((module) => module.askName(name));
  }

  rename(name: string): Promise<"ok" | "taken" | "refused" | "spent" | "invalid" | "offline"> {
    return conta().then((module) => module.rename(name));
  }

  choices(): Promise<Choices | null> {
    return conta().then((module) => module.choices());
  }

  choose(purpose: keyof Choices, granted: boolean): Promise<Choices | null> {
    return conta().then((module) => module.choose(purpose, granted));
  }

  exportData(): Promise<Record<string, unknown> | null> {
    return conta().then((module) => module.exportData());
  }

  deleteAccount(): Promise<boolean> {
    return conta().then((module) => module.deleteAccount());
  }
}
