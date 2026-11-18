// `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:journal`, `pnpm ledger:audit`.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { connect } from "./client.ts";
import { MIGRATIONS_DIR, migrate, sha256, type JournalEntry } from "./migrate.ts";
import { seed } from "./seed.ts";

/** Adds new migration files to journal.json. Never changes an existing entry. */
async function journal(): Promise<void> {
  const path = `${MIGRATIONS_DIR}journal.json`;
  const entries = JSON.parse(await readFile(path, "utf8")) as JournalEntry[];
  const known = new Set(entries.map((entry) => entry.id));
  for (const file of (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort()) {
    const id = file.slice(0, -4);
    if (known.has(id)) continue;
    entries.push({ id, sha256: sha256(await readFile(`${MIGRATIONS_DIR}${file}`, "utf8")) });
    console.log(`journal: added ${id}`);
  }
  await writeFile(path, `${JSON.stringify(entries, null, 2)}\n`);
}

const command = process.argv[2];
if (command === "journal") {
  await journal();
} else if (command === "audit") {
  // The proof the ledger convention asks for. Exits with an error when the books do not balance: the alarm.
  const { auditLedger } = await import("./ledger.ts");
  const sql = connect(undefined, 1);
  try {
    const said = await auditLedger(sql);
    console.log(`ledger: ${said.transfers} transfers; all accounts add up to ${said.sum}; ${said.wrong.length} balance(s) that do not match their rows; ${said.overdrawn.length} account(s) below zero that are not faucets`);
    for (const one of said.wrong) console.log(`ledger: ${one.account} is kept as ${one.kept} and its rows say ${one.derived}`);
    for (const one of said.overdrawn) console.log(`ledger: ${one} is below zero`);
    console.log(said.ok ? "ledger: the books balance" : "ledger: THE BOOKS DO NOT BALANCE");
    process.exitCode = said.ok ? 0 : 1;
  } finally {
    await sql.end();
  }
} else if (command === "migrate" || command === "seed") {
  const sql = connect(undefined, 1);
  try {
    if (command === "migrate") {
      const applied = await migrate(sql);
      console.log(applied.length ? `migrate: applied ${applied.join(", ")}` : "migrate: nothing to apply");
    } else {
      await seed(sql);
      console.log("seed: done");
    }
  } finally {
    await sql.end();
  }
} else {
  console.error("usage: cli.ts migrate | seed | journal");
  process.exitCode = 1;
}
