// A lotaria da vida on the server (D-0.44, Task 2.3). The card is dealt
// here, with the server's dice, once a player; the rules of the draw are in
// packages/economy. What is recorded is the card; the Makuta on it is paid
// through the ledger when the ledger has its API (Task 4.1).
//
// No rerolls: a family belongs to the device's first account. A second account
// made on a device that already has one is born into the same family, and
// begins with the least any family begins with. (A device id is only what a phone says of itself, so this stops the
// easy reroll and not the determined one: see docs/SECURITY.md.)

import { drawOrigin, originOf, type Origin, type OriginTable } from "@nzila/economy";
import { grantOrigin } from "@nzila/db";
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

/** The card's Makuta, in the player's Carteira: recorded once, whatever is asked. A refusal here is a fault, and stops the deal. */
async function paid(sql: Sql, playerId: string, makuta: number): Promise<void> {
  const [card] = await sql<{ paid_transfer_id: string | null }[]>`SELECT paid_transfer_id FROM player_origins WHERE player_id = ${playerId}`;
  if (card?.paid_transfer_id) return;
  const recorded = await grantOrigin(sql, playerId, makuta);
  if (!recorded.ok) throw new Error(`the Makuta of ${playerId}'s card of origin could not be recorded: ${recorded.error}`);
  // The card says by which transfer it was paid: the one change a card ever takes (migration 0003).
  await sql`UPDATE player_origins SET paid_transfer_id = ${recorded.transfer.id} WHERE player_id = ${playerId} AND paid_transfer_id IS NULL`;
}

/** Deals a player their card, or gives back the one they hold. */
export async function dealOrigin(sql: Sql, table: OriginTable, roll: () => number, playerId: string): Promise<Origin> {
  return sql.begin(async (tx) => {
    // The player's row is held, so that two requests at the same instant deal one card.
    await tx`SELECT id FROM players WHERE id = ${playerId} FOR UPDATE`;
    const [mine] = await tx<Recorded[]>`SELECT family, province, bairro, makuta, table_version AS version FROM player_origins WHERE player_id = ${playerId}`;
    if (mine) {
      // A card dealt before Makuta was real (or whose grant was lost) is honoured now: asked any number of times, paid once.
      const card = read(table, mine);
      await paid(tx as unknown as Sql, playerId, card.makuta);
      return card;
    }
    const [first] = await tx<Recorded[]>`
      SELECT o.family, o.province, o.bairro, o.makuta, o.table_version AS version
      FROM player_origins o JOIN devices d ON d.player_id = o.player_id
      WHERE d.device_hash IN (SELECT device_hash FROM devices WHERE player_id = ${playerId})
      ORDER BY o.drawn_at LIMIT 1`;
    // The first account of a phone is dealt from the whole table. A later one is born into the same family (no
    // rerolls) with the least any family begins with: a household that shares a phone has a second child who is not
    // born with nothing, and a phone cannot make accounts to collect a rich family's Makuta (the founder, 2026-11-18).
    const least = Math.min(...table.families.map((family) => family.min));
    const elder = first ? read(table, first) : null;
    const card = elder ? { ...elder, makuta: Math.min(elder.makuta, least) } : drawOrigin(table, roll);
    await tx`
      INSERT INTO player_origins (player_id, family, province, bairro, makuta, table_version)
      VALUES (${playerId}, ${card.family}, ${card.province}, ${card.bairro}, ${card.makuta}, ${card.version})`;
    // The Makuta on the card enters the world through the ledger, in the same breath as the card (D-4.1).
    await paid(tx as unknown as Sql, playerId, card.makuta);
    return card;
  });
}
