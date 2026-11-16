// The zone as the browser tests run it (tests/e2e): the real one, on the
// database the API of the tests has just made (apps/api/src/e2e-server.ts,
// which must be up first), running the districts the built client carries.
//
//   ZONE_PORT=2577 node apps/zone/src/e2e-server.ts

import { existsSync } from "node:fs";
import { connect, databaseUrl } from "@nzila/db";
import { redisPresence, redisUrl } from "@nzila/presence";
import { loadDistrict } from "./district.ts";
import { startZone } from "./server.ts";

const url = new URL(databaseUrl());
url.pathname = "/nzila_e2e";
const sql = connect(url.toString(), 10);
const districts = [];
for (const pack of ["dev", "l1"]) {
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
const zone = await startZone({ sql, districts, presence }, port);
console.log(`zone for the browser tests: ${zone.roomNames.join(", ")} on ${port}`);
