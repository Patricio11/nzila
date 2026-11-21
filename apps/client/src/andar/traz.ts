// What the corrida between two bairros brings down (Task 11.2): the files a street would ask for on getting off at
// a place, at a tier. The rule is the street's own (packages/world: streaming.ts, STREAM and planStream), written
// again here in a few lines because this is fetched with the crossing's sheet and must not pull the street's
// code into a file of its own in the way in (F-281); `traz.test.ts` holds the two to the same answer.

export type Tier = "poupanca" | "normal" | "alta";

/** For each tier: beyond the first distance nothing is drawn; within the second, the full model (0: never). Metres. */
const RULE: Readonly<Record<Tier, readonly [number, number]>> = { poupanca: [90, 0], normal: [140, 60], alta: [220, 100] };

export interface Pedaco {
  readonly id: string;
  /** [minX, minY, minZ, maxX, maxY, maxZ] in metres. */
  readonly aabb: readonly number[];
  readonly lods: readonly string[];
  readonly bytes?: Readonly<Record<string, number>>;
}

/** The model of each chunk to have at (x, z), nearest first, and what each weighs at this tier. */
export function traz(chunks: readonly Pedaco[], x: number, z: number, tier: Tier): { id: string; model: string; bytes: number }[] {
  const [far, near] = RULE[tier];
  const out: { id: string; model: string; bytes: number; distance: number }[] = [];
  for (const chunk of chunks) {
    const distance = Math.hypot(Math.max(chunk.aabb[0]! - x, 0, x - chunk.aabb[3]!), Math.max(chunk.aabb[2]! - z, 0, z - chunk.aabb[5]!));
    if (distance > far) continue;
    const models = chunk.lods.filter((file) => file.endsWith(".glb"));
    const model = near > 0 && distance <= near ? models[0] : models[models.length - 1];
    if (model) out.push({ id: chunk.id, model, bytes: chunk.bytes?.[tier] ?? 0, distance });
  }
  return out.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)).map(({ id, model, bytes }) => ({ id, model, bytes }));
}
