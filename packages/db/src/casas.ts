// The family's house (Phase 5; D-3.13, D-5.8): which house of which bairro a player was given. Given once, by the
// API, when the player first comes into the bairro their family's card wakes them in; read by the zone, which
// opens that house to them and to nobody else.

import { type Sql } from "postgres";

export interface FamilyHome {
  readonly districtId: string;
  /** The number of the house in its bairro: the first is 1. */
  readonly house: number;
  /** Which kind of house it is, of the pack of homes. */
  readonly kind: string;
}

/** The house a player's family gave them, or null for one who has none. */
export async function familyHomeOf(sql: Sql, playerId: string): Promise<FamilyHome | null> {
  const [row] = await sql<{ district_id: string; house: number; kind: string }[]>`SELECT district_id, house, kind FROM family_homes WHERE player_id = ${playerId}`;
  return row ? { districtId: row.district_id, house: row.house, kind: row.kind } : null;
}

/**
 * Gives a player their family's house in a bairro of `houses` houses, or gives back the one they hold (asked any
 * number of times, given once). The house with the fewest families is theirs, and `roll` (0 to 1) chooses among
 * those that have equally few: a street fills evenly, and nobody can tell which house a newcomer will get.
 */
export async function giveFamilyHome(sql: Sql, playerId: string, home: { districtId: string; houses: number; kind: string }, roll: () => number): Promise<FamilyHome> {
  if (!Number.isInteger(home.houses) || home.houses < 1) throw new Error(`a bairro of ${home.houses} houses has none to give`);
  const taken = await sql<{ house: number; n: number }[]>`SELECT house, count(*)::int AS n FROM family_homes WHERE district_id = ${home.districtId} AND house <= ${home.houses} GROUP BY house`;
  const families = new Map(taken.map((row) => [row.house, row.n]));
  let fewest = Infinity;
  let emptiest: number[] = [];
  for (let house = 1; house <= home.houses; house++) {
    const n = families.get(house) ?? 0;
    if (n < fewest) [fewest, emptiest] = [n, []];
    if (n === fewest) emptiest.push(house);
  }
  const house = emptiest[Math.min(emptiest.length - 1, Math.floor(roll() * emptiest.length))]!;
  // Two requests at the same instant give one house: the first written is the one both are told.
  await sql`INSERT INTO family_homes (player_id, district_id, house, kind) VALUES (${playerId}, ${home.districtId}, ${house}, ${home.kind}) ON CONFLICT (player_id) DO NOTHING`;
  return (await familyHomeOf(sql, playerId))!;
}
