// Streaming: which chunks of a district a player has, and at what detail.
// A district is never downloaded whole. As the player moves, the chunks
// around them are fetched, nearest first, and the ones left behind are let go.
//
// These are the rules, with no network and no renderer in them. The client
// follows them to stream; `pack check` follows the same rules to estimate
// what a player will download and what the phone will have to draw. One
// table, so the two can never disagree.

export type StreamTier = "poupanca" | "normal" | "alta";

export interface StreamRule {
  /** Beyond this many metres a chunk is not drawn: it is lost in the haze. The renderer's draw distance. */
  readonly farM: number;
  /** Within this many metres a chunk is drawn at full detail. 0 means never: only the reduced model is ever downloaded. */
  readonly nearM: number;
  /** How many chunks may be on their way at once. A cheap phone on mobile data gets fewer, so none of them starves. */
  readonly parallel: number;
}

/**
 * What each quality tier streams. Poupança never downloads a full-detail
 * model: it is what makes a district cost less than half as much on the
 * reference phone, and it is why a chunk's reduced model has to look right
 * on its own.
 */
export const STREAM: Readonly<Record<StreamTier, StreamRule>> = {
  poupanca: { farM: 90, nearM: 0, parallel: 2 },
  normal: { farM: 140, nearM: 60, parallel: 4 },
  alta: { farM: 220, nearM: 100, parallel: 4 },
};

/** A chunk is kept until the player is this much farther than the distance it was loaded at, so walking along an edge does not load and drop it over and over. */
export const KEEP_MARGIN = 1.2;

export interface StreamChunk {
  readonly id: string;
  /** [minX, minY, minZ, maxX, maxY, maxZ] in metres. */
  readonly aabb: readonly number[];
  /** Nearest first. Entries that are not models (an impostor picture) are ignored. */
  readonly lods: readonly string[];
}

/** Horizontal distance in metres from a point to a chunk's box; 0 inside it. */
export function distanceToChunk(aabb: readonly number[], x: number, z: number): number {
  const dx = Math.max(aabb[0]! - x, 0, x - aabb[3]!);
  const dz = Math.max(aabb[2]! - z, 0, z - aabb[5]!);
  return Math.hypot(dx, dz);
}

/** The models of a chunk, full detail first. A chunk with one model uses it at every distance. */
export function chunkModels(chunk: StreamChunk): { readonly full: string | null; readonly reduced: string | null } {
  const models = chunk.lods.filter((file) => file.endsWith(".glb"));
  return { full: models[0] ?? null, reduced: models[models.length - 1] ?? null };
}

/** Which model of a chunk a tier wants at a distance, or null for none. */
export function wantedModel(chunk: StreamChunk, distanceM: number, rule: StreamRule): string | null {
  if (distanceM > rule.farM) return null;
  const { full, reduced } = chunkModels(chunk);
  // A tier whose near distance is zero never shows full detail, not even from inside the chunk.
  return rule.nearM > 0 && distanceM <= rule.nearM ? full : reduced;
}

export interface StreamPlan {
  /** Chunks to have, nearest first, with the model each should show. */
  readonly want: readonly { readonly id: string; readonly model: string; readonly distanceM: number }[];
  /** Chunks that are loaded and are now far enough away to let go. */
  readonly drop: readonly string[];
}

/**
 * What to have and what to let go, for a player at (x, z). `loaded` is what
 * is held now: chunk id to the model shown. A loaded chunk is kept a little
 * past the distance at which it would be fetched.
 */
export function planStream(chunks: readonly StreamChunk[], x: number, z: number, rule: StreamRule, loaded: ReadonlyMap<string, string> = new Map()): StreamPlan {
  const want: { id: string; model: string; distanceM: number }[] = [];
  const drop: string[] = [];
  for (const chunk of chunks) {
    const distanceM = distanceToChunk(chunk.aabb, x, z);
    const model = wantedModel(chunk, distanceM, rule);
    if (model !== null) {
      // Do not swap a full model for a reduced one the moment the player steps over the line.
      const held = loaded.get(chunk.id);
      const { full } = chunkModels(chunk);
      const keepFull = held !== undefined && held === full && distanceM <= rule.nearM * KEEP_MARGIN;
      want.push({ id: chunk.id, model: keepFull ? held : model, distanceM });
    } else if (loaded.has(chunk.id)) {
      if (distanceM > rule.farM * KEEP_MARGIN) drop.push(chunk.id);
      else want.push({ id: chunk.id, model: loaded.get(chunk.id)!, distanceM });
    }
  }
  // Ties broken by id, so the order is the same on every run.
  want.sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id));
  return { want, drop: drop.sort() };
}
