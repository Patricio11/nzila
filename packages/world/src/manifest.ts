// The pack manifest: the contract between the people who build a place and
// the engine that runs it (WORLD_ATLAS.md §4). The engine reads only this and
// the files it names. Every object is strict: a field the schema does not
// know is an error, which is also how Rule 7 is kept. There is nowhere in a
// pack to write that a place is dangerous.
//
// This file imports Zod and is for tools and servers. The client trusts
// packs (they are immutable and addressed by their hash) and imports only
// the types.

import { z } from "zod";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lower case letters, digits and hyphens");
export const provinceIdSchema = z.string().regex(/^[a-z]{2}-[a-z]{3}$/, "a country and a province code, such as xx-yyy");
export const districtIdSchema = z.string().regex(/^[a-z]{2}-[a-z]{3}\/[a-z0-9]+$/, "a province code, a slash and a district code, such as xx-yyy/d1");
/** A key into the pt-AO catalog or the tunables. Never a sentence, never an amount. */
const key = z.string().regex(/^[a-z0-9]+([._-][a-z0-9]+)*$/i, "a dotted key");
const file = z.string().min(1);
const count = z.number().int().min(0);
/** [x, y, z] in metres at postcard scale. */
const pos = z.tuple([z.number(), z.number(), z.number()]);

const tierBytes = z.strictObject({ poupanca: count, normal: count, alta: count });
const lodStats = z.strictObject({ tris: count, draws: count });

const chunk = z.strictObject({
  id,
  /** [minX, minY, minZ, maxX, maxY, maxZ] in metres. */
  aabb: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
  /** Nearest first: full detail, reduced detail, then the impostor. */
  lods: z.array(file).min(1).max(3),
  walkGrid: file,
  bytes: tierBytes,
  /** What the chunk costs to draw up close and from afar, measured by the build. */
  stats: z.strictObject({ near: lodStats, far: lodStats }),
});

const spawn = z.strictObject({
  id,
  pos,
  facing: z.number().min(0).max(360),
  kind: z.enum(["first_arrival", "gateway", "respawn"]),
});

const gateway = z.strictObject({
  id,
  pos,
  to: districtIdSchema,
  /** The spawn to arrive at in the other district. */
  arrive: id,
  mode: z.enum(["walk", "ride", "walk|ride"]),
  openFlag: key,
});

/** `glyph` says what kind of place it is, by the name of a house glyph: the sign that floats over it. */
// `outing`: a place two may go out to together (Task 10.13, D-10.4).
const poi = z.strictObject({ id, pos, nameKey: key, lineKey: key, positive: z.boolean(), stamp: z.boolean(), glyph: id.optional(), outing: z.boolean().optional() });

const route = z.strictObject({
  id,
  kind: z.enum(["candongueiro", "boat"]),
  spline: file,
  /** Paragens in the order the route visits them, and the point of the spline each sits at. */
  stops: z.array(id).min(1),
  stopPoints: z.array(count).min(1),
  headwaySeconds: z.number().int().positive(),
  fareKey: key,
});

const paragem = z.strictObject({ id, pos, nameKey: key });

export const BUSINESS_KINDS = ["restaurante", "cantina", "barbearia", "oficina", "roulotte", "discoteca"] as const;
export const HOME_LAYOUTS = ["quarto", "t1", "t2", "vivenda"] as const;

const lot = z.strictObject({
  id,
  pos,
  front: id,
  interior: id,
  kinds: z.array(z.enum(BUSINESS_KINDS)).min(1),
  rentKey: key,
  adSlots: z.array(id),
});

const residence = z.strictObject({
  id,
  pos,
  units: z.number().int().positive(),
  layouts: z.array(z.enum(HOME_LAYOUTS)).min(1),
  rentKey: key,
});

const interior = z.strictObject({ id, file, bytes: count });

const adSlot = z.strictObject({
  id,
  kind: z.enum(["outdoor", "poster", "table", "radio"]),
  pos,
  size: z.tuple([z.number().positive(), z.number().positive()]),
  /** The way the surface looks, in degrees clockwise from the game's +Z. */
  facing: z.number().optional(),
});

export const manifestSchema = z.strictObject({
  id: districtIdSchema,
  province: provinceIdSchema,
  version: z.number().int().positive(),
  nameKey: key,
  /** 0 greybox, 1 kit, 2 final (stub S-2). */
  artPass: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  bounds: z.strictObject({ minX: z.number(), minZ: z.number(), maxX: z.number(), maxZ: z.number() }),
  ambient: z.strictObject({ set: id, soundBeds: z.array(id) }),
  chunks: z.array(chunk).min(1),
  spawns: z.array(spawn).min(1),
  gateways: z.array(gateway),
  pois: z.array(poi),
  routes: z.array(route),
  paragens: z.array(paragem),
  lots: z.array(lot),
  residences: z.array(residence),
  interiors: z.array(interior),
  npc: z.strictObject({ crowd: file.nullable(), vendors: file.nullable(), police: file.nullable() }),
  /** Inputs only. Heat itself is always computed (Rule 7). */
  heat: z.strictObject({
    lighting: file.nullable(),
    policePosts: z.array(pos),
    /** "zero" only for wonder districts, where nothing bad happens. */
    override: z.literal("zero").nullable(),
  }),
  adSlots: z.array(adSlot),
  /** Places to sit: a bench, a wall, a step. Where the seat is, and the way a sitter faces, in degrees clockwise from the game's +Z. */
  seats: z.array(z.strictObject({ id, pos: z.tuple([z.number(), z.number(), z.number()]), facing: z.number() })),
  /**
   * The tables where the bairro plays (Task 4B.1): the game, the middle of the board's top, the way seat 0 faces (in
   * degrees clockwise from +Z), the board's side in metres, and the seats in order round the table: seat 0 at the
   * near side, then to its left, across, to its right. The boards and pieces are drawn by the game as the zone says.
   */
  tables: z
    .array(z.strictObject({ id, game: z.enum(["xadrez", "damas", "ludo"]), pos, facing: z.number(), size: z.number().positive(), seats: z.array(z.strictObject({ pos, facing: z.number() })).min(2).max(4) }))
    .optional(),
  /** Sheets of water: the bay, a lagoon. [minX, minZ, maxX, maxZ] in metres, and the height of the surface. */
  // `shore`: how far each metre of it is from land, as a small greyscale picture the pack builder makes (built, not written).
  water: z.array(z.strictObject({ id, rect: z.tuple([z.number(), z.number(), z.number(), z.number()]), level: z.number(), shore: z.string().optional() })),
  /** Street name plates: where the plate is (its middle), the way its front faces in degrees clockwise from +Z, and the name as a key of the pack's strings. */
  signs: z.array(z.strictObject({ id, pos: z.tuple([z.number(), z.number(), z.number()]), facing: z.number(), textKey: key })).optional(),
  /** The district as a map for the Telemóvel: one character a cell. Fetched when the Mapa is opened, so it is not in the totals. */
  map: file.optional(),
  strings: file,
  sizes: z.strictObject({ firstView: count, total: tierBytes }),
});

/**
 * What a world builder writes (district.json). The same, without what the
 * build measures: sizes, drawing costs. File names here are paths inside the
 * district's directory; the build replaces them with content-hashed names.
 */
export const sourceManifestSchema = manifestSchema.omit({ sizes: true }).extend({
  chunks: z.array(chunk.omit({ bytes: true, stats: true })).min(1),
  interiors: z.array(interior.omit({ bytes: true })),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type SourceManifest = z.infer<typeof sourceManifestSchema>;
export type ManifestChunk = Manifest["chunks"][number];
export type TierBytes = z.infer<typeof tierBytes>;

/** Which provinces and districts exist (content/registry.json). */
export const registrySchema = z.strictObject({
  provinces: z.array(z.strictObject({ id: provinceIdSchema, nameKey: key, open: z.boolean() })),
  districts: z.array(z.strictObject({ id: districtIdSchema, provinceId: provinceIdSchema, nameKey: key, open: z.boolean() })),
});
export type Registry = z.infer<typeof registrySchema>;

/** Problems in the words of the schema, one per line, each with its path. */
export function schemaProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`);
}
