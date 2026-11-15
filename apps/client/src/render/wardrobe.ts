// Dressing a person. The wardrobe (art/scripts/make_wardrobe.py) holds every
// body a player may have and every way of wearing their hair, each its own
// model on the shared skeleton, painted with markers. Here a body and a head
// of hair are put on one skeleton and the markers are repainted with what the
// player chose: skin, hair, each piece of clothing.

import { COLOURS, type Look } from "@nzila/protocol";
import { ATLAS_CELLS, ATLAS_NAMES, atlasUv } from "@nzila/world/client";
import { Mesh, SkinnedMesh, type BufferAttribute, type Group, type Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { meteredFetch } from "../net/data-meter.ts";
import { Person } from "./person.ts";
import { type WorldRenderer } from "./world-renderer.ts";

const WARDROBE = "/packs/guarda-roupa/";

// What a look is, and the colours it may have, are in packages/protocol: the server reads the same list (D-2.1).
export { COLOURS, type Look };

interface Piece {
  readonly model: string;
  readonly triangles: number;
  readonly skirt?: boolean;
}

/** What the wardrobe holds, by sex. A hair style with no model is the scalp alone. */
export type Wardrobe = Readonly<Record<"f" | "m", { readonly height: number; readonly bodies: Readonly<Record<string, Readonly<Record<string, Piece>>>>; readonly hair: Readonly<Record<string, Piece | null>>; readonly extras?: Readonly<Record<string, Piece>> }>>;

export const FIRST_LOOK: Look = { sex: "f", skin: 2, hair: "trancas", hairColour: "hairBlack", top: "blusa", topColour: "awningGold", bottom: "pano", bottomColour: "awningTeal", bands: "awningGold", shoe: "shoeTan" };

const KEY = "nzila.look";

/** The look kept on this device, or null when none was ever chosen. */
export function savedLook(): Look | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Look> | null;
    return value && (value.sex === "f" || value.sex === "m") && typeof value.hair === "string" && typeof value.top === "string" ? { ...FIRST_LOOK, ...value } : null;
  } catch {
    return null;
  }
}

export function saveLook(look: Look): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    // Storage is off: the look lasts for this visit only.
  }
}

const PHOTO = "nzila.foto";

/** The photograph for the BI, taken in the look chooser: an image address, or null. */
export function savedPhoto(): string | null {
  try {
    const photo = localStorage.getItem(PHOTO);
    return photo?.startsWith("data:image/") ? photo : null;
  } catch {
    return null;
  }
}

/** Keeps a photograph of what the canvas shows now: the middle of it, in the shape of the frame on the BI. Call it in the same turn as the drawing. */
export function takePhoto(canvas: HTMLCanvasElement): void {
  const frame = document.createElement("canvas");
  frame.width = 144;
  frame.height = 176;
  const height = Math.min(canvas.height, (canvas.width * frame.height) / frame.width);
  const width = (height * frame.width) / frame.height;
  try {
    frame.getContext("2d")?.drawImage(canvas, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height, 0, 0, frame.width, frame.height);
    localStorage.setItem(PHOTO, frame.toDataURL("image/jpeg", 0.82));
  } catch {
    // No photograph: the BI shows its own mark in the frame.
  }
}

let listed: Promise<Wardrobe> | null = null;

/** What there is to wear. Rejects when the wardrobe is not built on this machine. */
export function wardrobe(): Promise<Wardrobe> {
  listed ??= meteredFetch(`${WARDROBE}guarda-roupa.json`).then((bytes) => JSON.parse(new TextDecoder().decode(bytes)) as Wardrobe);
  return listed;
}

/** A look the wardrobe can dress: whatever it lacks is replaced by the nearest thing it has. */
export function fitted(look: Look, has: Wardrobe): Look {
  const mine = has[look.sex];
  const top = mine.bodies[look.top] ? look.top : Object.keys(mine.bodies)[0]!;
  const bottoms = mine.bodies[top]!;
  const bottom = bottoms[look.bottom] ? look.bottom : Object.keys(bottoms)[0]!;
  const hair = look.hair in mine.hair ? look.hair : Object.keys(mine.hair)[0]!;
  const extras = (look.extras ?? []).filter((extra) => extra in (mine.extras ?? {}));
  const step = (n: number | undefined): number => Math.min(1, Math.max(-1, Math.round(n ?? 0)));
  return { ...look, top, bottom, hair, extras, tall: step(look.tall), broad: step(look.broad), skin: Math.min(4, Math.max(0, Math.round(look.skin))) };
}

const square = (name: string): number => {
  const index = ATLAS_NAMES.indexOf(name);
  if (index < 0) throw new Error(`the palette has no ${name}`);
  return index;
};

/** Repaints every marker on a mesh. The mesh gets its own copy of the paint, so two people can differ. */
function repaint(mesh: Mesh, paints: Readonly<Record<string, string>>): void {
  const swaps = new Map<number, readonly [number, number]>();
  for (const [marker, paint] of Object.entries(paints)) swaps.set(square(marker), atlasUv(square(paint)));
  mesh.geometry = mesh.geometry.clone();
  const uv = mesh.geometry.getAttribute("uv") as BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const to = swaps.get(Math.floor(uv.getX(i) * ATLAS_CELLS) + Math.floor(uv.getY(i) * ATLAS_CELLS) * ATLAS_CELLS);
    if (to) uv.setXY(i, to[0], to[1]);
  }
  uv.needsUpdate = true;
}

async function piece(renderer: WorldRenderer, model: string): Promise<{ scene: Group; mesh: SkinnedMesh }> {
  const scene = (await new GLTFLoader().parseAsync(await meteredFetch(WARDROBE + model), "")).scene;
  const found: SkinnedMesh[] = [];
  scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    (node.material as Material).dispose();
    node.material = renderer.paletteMaterial;
    node.castShadow = true;
    node.receiveShadow = false;
    if (node instanceof SkinnedMesh) found.push(node);
  });
  const mesh = found[0];
  if (!mesh) throw new Error(`${model} has no skeleton`);
  return { scene, mesh };
}

/** Builds the person a look describes. Rejects when the wardrobe is not built. */
export async function dress(renderer: WorldRenderer, asked: Look): Promise<Person> {
  const has = await wardrobe();
  const look = fitted(asked, has);
  const mine = has[look.sex];
  const outfit = mine.bodies[look.top]![look.bottom]!;
  const hairPiece = mine.hair[look.hair] ?? null;
  const [body, hair, ...extras] = await Promise.all([piece(renderer, outfit.model), hairPiece ? piece(renderer, hairPiece.model) : Promise.resolve(null), ...(look.extras ?? []).map((extra) => piece(renderer, mine.extras![extra]!.model))]);

  const paints = {
    slotSkin: `skin${look.skin}`,
    slotLip: `lip${look.skin}`,
    slotLipDark: `lipDark${look.skin}`,
    slotTop: look.topColour,
    slotBottom: look.bottomColour,
    // Only a pano has stripes of a second colour: on a skirt or a dress they are the cloth's own.
    slotBands: look.bottom === "pano" ? look.bands : look.bottom === "none" ? look.topColour : look.bottomColour,
    slotShoe: look.shoe,
  };
  // The scalp: skin on a shaved head, cut to the dark under a crest whatever the crest is dyed, hair otherwise.
  repaint(body.mesh, { ...paints, slotHair: look.hair === "careca" ? `skin${look.skin}` : look.hair === "galo" ? "hairBlack" : look.hairColour });
  // A beard is the hair's own colour unless the hair is dyed or covered: then it is the dark it grew.
  const natural = ["hairBlack", "hairBrown", "hairGrey"].includes(look.hairColour) && look.hair !== "lenco" && look.hair !== "bone" ? look.hairColour : "hairBlack";
  for (const [worn, colour] of [...(hair ? [[hair, look.hairColour] as const] : []), ...extras.map((extra) => [extra, natural] as const)]) {
    const hair = worn;
    repaint(hair.mesh, { ...paints, slotHair: colour });
    // The hair came with a skeleton of its own, the same bones: it is moved onto the body's, bone by name.
    const bones = body.mesh.skeleton.bones;
    const index = hair.mesh.geometry.getAttribute("skinIndex") as BufferAttribute;
    const to = hair.mesh.skeleton.bones.map((bone) => Math.max(0, bones.findIndex((other) => other.name === bone.name)));
    for (let i = 0; i < index.count; i++) index.setXYZW(i, to[index.getX(i)]!, to[index.getY(i)]!, to[index.getZ(i)]!, to[index.getW(i)]!);
    index.needsUpdate = true;
    hair.mesh.frustumCulled = false;
    body.mesh.parent?.add(hair.mesh);
    hair.mesh.bind(body.mesh.skeleton, body.mesh.bindMatrix);
  }
  // Taller or shorter, slighter or broader: the whole person, in steps of a hand's width.
  const tall = 1 + (look.tall ?? 0) * 0.055;
  const broad = 1 + (look.broad ?? 0) * 0.09;
  const person = new Person(body.scene, body.mesh, mine.height * tall, outfit.skirt === true);
  person.root.scale.set(tall * broad, tall, tall * broad);
  person.female = look.sex === "f";
  return person;
}
