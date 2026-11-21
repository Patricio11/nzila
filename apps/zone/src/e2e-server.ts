// The zone as the browser tests run it (tests/e2e): the real one, on the
// database the API of the tests has just made (apps/api/src/e2e-server.ts,
// which must be up first), running the districts the built client carries.
//
//   ZONE_PORT=2577 node apps/zone/src/e2e-server.ts

import { existsSync } from "node:fs";
import { connect, databaseUrl } from "@nzila/db";
import { loadChatFilter } from "@nzila/i18n/server";
import { redisPresence, redisUrl } from "@nzila/presence";
import { loadDistrict, registryPacks } from "./district.ts";
import { startZone } from "./server.ts";

const url = new URL(databaseUrl());
url.pathname = "/nzila_e2e";
const sql = connect(url.toString(), 10);
const districts = [];
for (const pack of ["dev", ...registryPacks()]) {
  const folder = new URL(`../../client/public/packs/${pack}/`, import.meta.url);
  // A machine without Blender has no packs: the zone then runs nothing, and the tests that need it say so.
  if (!existsSync(new URL("manifest.json", folder))) continue;
  const district = await loadDistrict(folder);
  const [known] = await sql`SELECT 1 FROM districts WHERE id = ${district.id}`;
  districts.push({ district, remember: known !== undefined });
}
const port = Number(process.env.ZONE_PORT ?? 2577);
// The same keys as the API of the tests (apps/api/src/e2e-server.ts), and nobody else's.
const presence = await redisPresence(redisUrl(), "nzila-e2e");
// A fallen line's place is kept eight seconds here, not sixty: long enough for the test that comes back to it,
// short enough that a test which fails does not leave a body standing in the next test's street.
// A quick game at a table lasts 40 seconds here, not three minutes: the test that plays one to its end waits that long.
const zone = await startZone({ sql, districts, presence, filter: loadChatFilter(), holdMs: 8000, rapidaMs: 40_000 }, port);
console.log(`zone for the browser tests: ${zone.roomNames.join(", ")} on ${port}`);
