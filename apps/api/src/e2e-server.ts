// The API as the browser tests run it (tests/e2e): the real app, on a
// database of its own that is made afresh each time, so that a test walks the
// whole road a new player does: the door, a guest, a look, a card.
//
//   API_PORT=4010 node apps/api/src/e2e-server.ts
//
// It needs PostgreSQL (`pnpm services`), like the integration tests.

import { connect, databaseUrl, loadMigrations, loadWorldSeed, migrate, parseKeyring, putStaff, seed } from "@nzila/db";
import { redisPresence, redisUrl } from "@nzila/presence";
import postgres from "postgres";
import { buildApp } from "./app.ts";
import { hashPassword } from "./linking.ts";

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
// The zone of the tests (apps/zone/src/e2e-server.ts) says where it is under the same keys, and nobody else's.
const presence = await redisPresence(redisUrl(), "nzila-e2e");
// In the tests an account may hand Makuta over on its first day: nobody waits three days for a test.
const app = buildApp({ transfers: { noSendDays: 0, newAccountDays: 7, newAccountDailyCap: 50_000, dailyCap: 500_000 }, guests: true, presence, sql, pepper: new Uint8Array(32).fill(5), keyring, limiter: { allow: () => true }, sender: { send: async () => {} }, mailer: { send: async () => {} }, phoneCodes: true, newCode: () => "246810" });
// The staff of the tests (tests/e2e/studio.spec.ts): a moderator and someone from support, in a database that lives one run.
const staffPassword = await hashPassword("palavra-passe-dos-testes");
await putStaff(sql, { email: "moderacao@nzila.test", name: "Moderadora dos Testes", passwordHash: staffPassword, roles: ["moderador"] });
await putStaff(sql, { email: "apoio@nzila.test", name: "Apoio dos Testes", passwordHash: staffPassword, roles: ["support"] });
const port = Number(process.env.API_PORT ?? 4010);
await app.listen({ port, host: "127.0.0.1" });
console.log(`api for the browser tests: listening on ${port}`);
