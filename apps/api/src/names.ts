// A player's name (Task 2.3). The shape of a name is the shared rule of
// packages/protocol; here are the three things only the server can say:
// whether a name is one the game keeps for itself, whether the filter's word
// lists object to it, and whether somebody already has it.
//
// A guest arrives with a name of their own ("Caluanda 1042", from the number
// of their BI) and may change it once for nothing. What a later change costs
// is the economy's to say (Phase 4); until then there is no later change.

import { readFileSync } from "node:fs";
import { createChatFilter, parseWordList, type ChatFilter } from "@nzila/i18n";
import { checkName, type NameFault } from "@nzila/protocol";
import { type Sql } from "postgres";
import { Refusal } from "./routes.ts";

/** Names nobody may take: they would pass for the game or its staff. Compared against the plain key of a name. */
const RESERVED = ["nzila", "admin", "moderador", "moderadora", "suporte", "equipa", "estudio", "oficial", "staff"];
/** The shape of the name a guest arrives with: nobody may choose one, or they could take a name about to be given. */
const ARRIVAL = /^caluanda\d+$/;

/** How many changes of name cost nothing. */
export const FREE_NAME_CHANGES = 1;

/** The word lists the chat filter reads (packages/i18n/filter), applied to names too. */
export function loadNameFilter(): ChatFilter {
  const list = (file: string): string[] => parseWordList(readFileSync(new URL(`../../../packages/i18n/filter/${file}`, import.meta.url), "utf8"));
  return createChatFilter([...list("pt.txt"), ...list("ao.txt")]);
}

/** The BI number and the name a guest arrives with, from the order of their arrival. */
export function arrivalIdentity(order: number): { biNumber: string; name: string; nameKey: string } {
  return { biNumber: `${String(order).padStart(8, "0")}-LA`, name: `Caluanda ${order}`, nameKey: `caluanda${order}` };
}

export type NameAnswer = "free" | "yours" | "taken" | "refused" | NameFault;

/** The name as it would be kept, or why not, before anyone looks at who has it. */
function candidate(filter: ChatFilter, input: unknown): { name: string; key: string } | "refused" | NameFault {
  const checked = checkName(input);
  if (typeof checked === "string") return checked;
  if (ARRIVAL.test(checked.key) || RESERVED.some((word) => checked.key.includes(word)) || filter.find(checked.name).length > 0) return "refused";
  return checked;
}

/** What the game tells a player about a name while they type it. */
export async function askName(sql: Sql, filter: ChatFilter, playerId: string, input: unknown): Promise<NameAnswer> {
  const wanted = candidate(filter, input);
  if (typeof wanted === "string") return wanted;
  const [holder] = await sql<{ id: string }[]>`SELECT id FROM players WHERE name_key = ${wanted.key}`;
  return !holder ? "free" : holder.id === playerId ? "yours" : "taken";
}

/** Changes a player's name. Refuses with one word: what is wrong is the client's to say in its own. */
export async function rename(sql: Sql, filter: ChatFilter, playerId: string, input: unknown): Promise<{ name: string; nameFree: boolean }> {
  const wanted = candidate(filter, input);
  if (wanted === "refused") throw new Refusal(422, "name_refused");
  if (typeof wanted === "string") throw new Refusal(400, "invalid");
  try {
    return await sql.begin(async (tx) => {
      const [mine] = await tx<{ name_key: string | null; name_changes: number }[]>`SELECT name_key, name_changes FROM players WHERE id = ${playerId} FOR UPDATE`;
      // The same name written another way (an accent, a capital) is a correction, not a change.
      const respelt = mine!.name_key === wanted.key;
      if (!respelt && mine!.name_changes >= FREE_NAME_CHANGES) throw new Refusal(409, "name_spent");
      const changes = mine!.name_changes + (respelt ? 0 : 1);
      await tx`UPDATE players SET name = ${wanted.name}, name_key = ${wanted.key}, name_changes = ${changes} WHERE id = ${playerId}`;
      return { name: wanted.name, nameFree: changes < FREE_NAME_CHANGES };
    });
  } catch (error) {
    // Two players asked for one name at the same instant: the index decides, and the second is told.
    if ((error as { code?: string }).code === "23505") throw new Refusal(409, "name_taken");
    throw error;
  }
}
