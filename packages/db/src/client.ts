import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.ts";

export const DEFAULT_DATABASE_URL = "postgres://nzila:nzila@localhost:5432/nzila";

/** The connection string from the environment, or the development default. */
export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

/** A connection pool. Notices (such as "already exists, skipping" from guarded migrations) are not printed. */
export function connect(url = databaseUrl(), max = 10): Sql {
  return postgres(url, { max, onnotice: () => {} });
}

/** Drizzle on top of a pool, with the schema, for typed queries. */
export function createDb(sql: Sql) {
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
