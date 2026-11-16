// The API as the browser tests run it (tests/e2e): the real app, on a
// database of its own that is made afresh each time, so that a test walks the
// whole road a new player does: the door, a guest, a look, a card.
//
//   API_PORT=4010 node apps/api/src/e2e-server.ts
//
// It needs PostgreSQL (`pnpm services`), like the integration tests.

import { connect, databaseUrl, loadMigrations, loadWorldSeed, migrate, parseKeyring, seed } from "@nzila/db";
import postgres from "postgres";
import { buildApp } from "./app.ts";

const name = "nzila_e2e";
const admin = postgres(databaseUrl(), { max: 1, onnotice: () => {} });
await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE ${name}`);
await admin.end();

const url = new URL(databaseUrl());
url.pathname = `/${name}`;
const sql = connect(url.toString(), 10);
await migrate(sql, await loadMigrations());
await seed(sql, await loadWorldSeed());

// A fixed key, for a database that lives as long as one run of the tests. Limits are wide open: every test comes from one address.
// Every code sent is the same one, and goes nowhere: the tests type it.
const keyring = parseKeyring(`1:${Buffer.alloc(32, 6).toString("base64")}`);
const app = buildApp({ sql, pepper: new Uint8Array(32).fill(5), keyring, limiter: { allow: () => true }, sender: { send: async () => {} }, mailer: { send: async () => {} }, phoneCodes: true, newCode: () => "246810" });
const port = Number(process.env.API_PORT ?? 4010);
await app.listen({ port, host: "127.0.0.1" });
console.log(`api for the browser tests: listening on ${port}`);
