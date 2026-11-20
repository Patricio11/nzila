// Where to eat, for a hungry player (Task 4.4, UX_UI_SPEC.md: "Estás com fome. Há uma cantina a 40 m." and the
// compass points to food): the nearest cantina of the district, from its places. Fetched with the bars.

import type { Marked } from "../telemovel/telemovel.tsx";

/** The places that sell something to eat, by their sign: a cantina today; a roulotte, a zungueira's spot as they come. */
const FOOD_GLYPHS = ["cantina"];

/** What of the world this needs: where the player stands (metres), and the district's places and words. */
export interface Arredores {
  readonly player: { readonly x: number; readonly z: number } | null;
  district(): { readonly pois?: readonly { readonly glyph?: string | undefined; readonly nameKey: string; readonly pos: readonly number[] }[] } | null;
  word(key: string): string;
}

/** The nearest place to eat, by its name, and how far in tens of metres (never under ten); null when there is none. */
export function nearestFood(world: Arredores): (Marked & { readonly metres: number }) | null {
  const at = world.player;
  if (!at) return null;
  let best: { x: number; z: number; key: string; metres: number } | null = null;
  for (const place of world.district()?.pois ?? []) {
    if (!FOOD_GLYPHS.includes(place.glyph ?? "")) continue;
    const x = place.pos[0] ?? 0;
    const z = place.pos[2] ?? 0;
    const metres = Math.hypot(x - at.x, z - at.z);
    if (!best || metres < best.metres) best = { x, z, key: place.nameKey, metres };
  }
  return best && { x: best.x, z: best.z, name: world.word(best.key), metres: Math.max(10, Math.round(best.metres / 10) * 10) };
}
