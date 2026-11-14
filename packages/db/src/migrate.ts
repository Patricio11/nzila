// Applying migrations. A migration is a SQL file in ../migrations with an
// entry in journal.json: its id and the SHA-256 of its content. The journal
// lands in the same commit as the file (migration convention).
//
// Forward-only: a migration that has been applied is never edited. If the
// file on disk no longer matches what the database recorded, this stops with
// an error instead of guessing.

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type Sql } from "postgres";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

export interface JournalEntry {
  readonly id: string;
  readonly sha256: string;
}

export interface Migration extends JournalEntry {
  readonly sql: string;
}

export function sha256(text: string): string {
  // Line endings are normalised so a checkout on Windows hashes the same as one on Linux.
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

/** Reads the journal and its files. Throws when they disagree. */
export async function loadMigrations(dir = MIGRATIONS_DIR): Promise<Migration[]> {
  const journal = JSON.parse(await readFile(`${dir}journal.json`, "utf8")) as JournalEntry[];
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  const listed = journal.map((entry) => `${entry.id}.sql`);
  if (files.join() !== listed.join()) {
    throw new Error(`migrations and journal.json disagree: files [${files.join(", ")}], journal [${listed.join(", ")}]`);
  }
  const migrations: Migration[] = [];
  for (const entry of journal) {
    const sql = await readFile(`${dir}${entry.id}.sql`, "utf8");
    if (sha256(sql) !== entry.sha256) {
      throw new Error(`${entry.id}.sql does not match its journal entry. An applied migration is never edited: write a new one.`);
    }
    migrations.push({ ...entry, sql });
  }
  return migrations;
}

/** Applies every migration not yet applied, each in its own transaction. Returns the ids it applied. */
export async function migrate(sql: Sql, migrations?: readonly Migration[]): Promise<string[]> {
  const list = migrations ?? (await loadMigrations());
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          text PRIMARY KEY,
      sha256      text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )`;
  const applied = new Map<string, string>();
  for (const row of await sql<{ id: string; sha256: string }[]>`SELECT id, sha256 FROM schema_migrations`) {
    applied.set(row.id, row.sha256);
  }
  const done: string[] = [];
  for (const migration of list) {
    const before = applied.get(migration.id);
    if (before === migration.sha256) continue;
    if (before !== undefined) {
      throw new Error(`${migration.id} was applied with different content. An applied migration is never edited.`);
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(migration.sql);
      await tx`INSERT INTO schema_migrations (id, sha256) VALUES (${migration.id}, ${migration.sha256})`;
    });
    done.push(migration.id);
  }
  return done;
}
