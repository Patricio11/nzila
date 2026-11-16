// Starts a zone.
//   ZONE_PORT   where it listens (2567)
//   ZONE_PACKS  the built packs of the districts it runs, separated by commas: folders with a manifest.json.
//               Not given: Marginal e Baixa and the rehearsal town, as the client's own build has them.
//   ZONE_PUBLIC_URL  where a phone reaches this zone (wss://…), as the API hands it out.
//                    Not given: "the game's own address, at /zone", which is right behind one proxy.
//   ZONE_SESSIONS    "on" lets a session token in without a seat from the API: for the swarm and a
//                    developer's machine only. A zone players reach leaves it off.
//   DATABASE_URL, REDIS_URL

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { connect } from "@nzila/db";
import { BASE_TUNABLES } from "@nzila/economy";
import { memoryPresence, redisPresence, type Presence } from "@nzila/presence";
import { loadDistrict } from "./district.ts";
import { startZone } from "./server.ts";

const port = Number(process.env.ZONE_PORT ?? 2567);
const packs = process.env.ZONE_PACKS
  ? process.env.ZONE_PACKS.split(",").map((folder) => pathToFileURL(`${folder.trim()}/`))
  : ["l1", "dev"].map((pack) => new URL(`../../client/public/packs/${pack}/`, import.meta.url)).filter((folder) => existsSync(new URL("manifest.json", folder)));

const sql = connect();
const districts = [];
for (const pack of packs) {
  const district = await loadDistrict(pack);
  // A player's place is kept only in a district the world's registry knows: the rehearsal town is nobody's home.
  const [known] = await sql`SELECT 1 FROM districts WHERE id = ${district.id}`;
  districts.push({ district, remember: known !== undefined });
}
// Redis is where the API finds this zone. Without it the zone still runs, alone: only sessions can come in.
let presence: Presence;
try {
  presence = await redisPresence();
} catch (error) {
  console.error(`zone: no Redis (${String(error)}): running with no matchmaker`);
  presence = memoryPresence();
}
const sessions = process.env.ZONE_SESSIONS === "on";
const zone = await startZone({ sql, districts, presence, address: process.env.ZONE_PUBLIC_URL ?? "", sessions, holds: BASE_TUNABLES.channels.cap }, port);
console.log(`zone: ${zone.id}: ${zone.roomNames.join(", ")} on :${port}${sessions ? " (sessions let in without a seat)" : ""}`);

let closing = false;
const stop = async (): Promise<void> => {
  if (closing) return;
  closing = true;
  await zone.close();
  await presence.close();
  await sql.end();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
