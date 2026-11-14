// `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:journal`.

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
