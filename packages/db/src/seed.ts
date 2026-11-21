// The rows a fresh database needs before anything can run: the system
// accounts of the ledger and the first province and district. Safe to run
// again at any time: it adds what is missing and changes nothing that is
// there. Which places exist is data (content/registry.json, the same file `pack check`
// reads), not code (Rule 9).

import { parseAccountId, systemAccountIds } from "@nzila/economy";
import { readFile } from "node:fs/promises";
import { type Sql } from "postgres";

interface WorldSeed {
  readonly provinces: readonly { id: string; nameKey: string; open: boolean }[];
  /** `pack`: the folder its built pack is served from. `wakes`: the tiers of family that wake here (D-11.1); the first district takes everyone else. */
  readonly districts: readonly { id: string; provinceId: string; nameKey: string; open: boolean; pack?: string; wakes?: readonly string[] }[];
}

export async function loadWorldSeed(): Promise<WorldSeed> {
  return JSON.parse(await readFile(new URL("../../../content/registry.json", import.meta.url), "utf8")) as WorldSeed;
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
