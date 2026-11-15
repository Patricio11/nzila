// Checks on the migration files that need no database. The ones that do are
// in db.integration.test.ts.

import { expect, test } from "vitest";
import { loadMigrations, sha256 } from "./migrate.ts";

test("every migration file is in the journal with the hash of its content", async () => {
  const migrations = await loadMigrations();
  expect(migrations.length).toBeGreaterThan(0);
  expect(migrations.map((m) => m.id)).toEqual([...migrations.map((m) => m.id)].sort());
  for (const m of migrations) expect(sha256(m.sql)).toBe(m.sha256);
});

test("the hash does not depend on the line endings of the checkout", () => {
  expect(sha256("a\r\nb\r\n")).toBe(sha256("a\nb\n"));
});

test("every statement is guarded, so running a migration again changes nothing", async () => {
  for (const m of await loadMigrations()) {
    // Function bodies are checked by Postgres; here they would only confuse the statement split.
    const withoutBodies = m.sql.replace(/\$\$[\s\S]*?\$\$/g, "$$body$$").replace(/--.*$/gm, "");
    const statements = withoutBodies.split(";").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      const guarded =
        /^CREATE TABLE IF NOT EXISTS /.test(statement) ||
        /^CREATE (UNIQUE )?INDEX IF NOT EXISTS /.test(statement) ||
        /^CREATE SEQUENCE IF NOT EXISTS /.test(statement) ||
        /^CREATE OR REPLACE (FUNCTION|TRIGGER) /.test(statement) ||
        /^ALTER TABLE \S+ ADD COLUMN IF NOT EXISTS /.test(statement) ||
        /^DO \$\$body\$\$$/.test(statement);
      expect(guarded, `${m.id}: not guarded against a re-run: ${statement.slice(0, 80)}`).toBe(true);
    }
  }
});
