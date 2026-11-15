// A lotaria da vida on the server (D-0.44, Task 2.3). The card is dealt
// here, with the server's dice, once a player; the rules of the draw are in
// packages/economy. What is recorded is the card; the Makuta on it is paid
// through the ledger when the ledger has its API (Task 4.1).
//
// No rerolls: a card belongs to the device's first guest. A second guest
// made on a device that already has one is dealt the same card, not a new
// one. (A device id is only what a phone says of itself, so this stops the
// easy reroll and not the determined one: see docs/SECURITY.md.)

import { drawOrigin, originOf, type Origin, type OriginTable } from "@nzila/economy";
import { type Sql } from "postgres";

interface Recorded {
  family: string;
  province: string;
  bairro: string;
  /** A bigint comes back from PostgreSQL as text. */
  makuta: string;
  version: number;
}

function read(table: OriginTable, row: Recorded): Origin {
  const card = originOf(table, { ...row, makuta: Number(row.makuta) });
  // Families leave the deal by a weight of nothing, never by leaving the table.
  if (!card) throw new Error(`the table of origins has lost the family ${row.family}`);
  return card;
}

/** The card a player holds, or null when none was dealt yet. */
export async function originOfPlayer(sql: Sql, table: OriginTable, playerId: string): Promise<Origin | null> {
  const [row] = await sql<Recorded[]>`SELECT family, province, bairro, makuta, table_version AS version FROM player_origins WHERE player_id = ${playerId}`;
  return row ? read(table, row) : null;
}

/** Deals a player their card, or gives back the one they hold. */
export async function dealOrigin(sql: Sql, table: OriginTable, roll: () => number, playerId: string): Promise<Origin> {
  return sql.begin(async (tx) => {
    // The player's row is held, so that two requests at the same instant deal one card.
    await tx`SELECT id FROM players WHERE id = ${playerId} FOR UPDATE`;
    const [mine] = await tx<Recorded[]>`SELECT family, province, bairro, makuta, table_version AS version FROM player_origins WHERE player_id = ${playerId}`;
    if (mine) return read(table, mine);
    const [first] = await tx<Recorded[]>`
      SELECT o.family, o.province, o.bairro, o.makuta, o.table_version AS version
      FROM player_origins o JOIN devices d ON d.player_id = o.player_id
      WHERE d.device_hash IN (SELECT device_hash FROM devices WHERE player_id = ${playerId})
      ORDER BY o.drawn_at LIMIT 1`;
    const card = first ? read(table, first) : drawOrigin(table, roll);
    await tx`
      INSERT INTO player_origins (player_id, family, province, bairro, makuta, table_version)
      VALUES (${playerId}, ${card.family}, ${card.province}, ${card.bairro}, ${card.makuta}, ${card.version})`;
    return card;
  });
}
