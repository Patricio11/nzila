// The rows a fresh database needs before anything can run: the system
// accounts of the ledger and the first province and district. Safe to run
// again at any time: it adds what is missing and changes nothing that is
// there. Which places exist is data (seed/world.json), not code (Rule 9).

import { parseAccountId, systemAccountIds } from "@nzila/economy";
import { readFile } from "node:fs/promises";
import { type Sql } from "postgres";

interface WorldSeed {
  readonly provinces: readonly { id: string; nameKey: string; open: boolean }[];
  readonly districts: readonly { id: string; provinceId: string; nameKey: string; open: boolean }[];
}

export async function loadWorldSeed(): Promise<WorldSeed> {
  return JSON.parse(await readFile(new URL("../seed/world.json", import.meta.url), "utf8")) as WorldSeed;
}

export async function seed(sql: Sql, world?: WorldSeed): Promise<void> {
  const { provinces, districts } = world ?? (await loadWorldSeed());
  await sql.begin(async (tx) => {
    for (const id of systemAccountIds()) {
      const { kind, ref } = parseAccountId(id)!;
      await tx`INSERT INTO ledger_accounts (id, kind, ref) VALUES (${id}, ${kind}, ${ref}) ON CONFLICT (id) DO NOTHING`;
    }
    for (const p of provinces) {
      await tx`INSERT INTO provinces (id, name_key, open) VALUES (${p.id}, ${p.nameKey}, ${p.open}) ON CONFLICT (id) DO NOTHING`;
    }
    for (const d of districts) {
      await tx`
        INSERT INTO districts (id, province_id, name_key, open) VALUES (${d.id}, ${d.provinceId}, ${d.nameKey}, ${d.open})
        ON CONFLICT (id) DO NOTHING`;
    }
  });
}
