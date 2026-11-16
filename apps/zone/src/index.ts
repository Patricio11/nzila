// Starts a zone.
//   ZONE_PORT   where it listens (2567)
//   ZONE_PACKS  the built packs of the districts it runs, separated by commas: folders with a manifest.json.
//               Not given: Marginal e Baixa and the rehearsal town, as the client's own build has them.
//   DATABASE_URL

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { connect } from "@nzila/db";
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
const zone = await startZone({ sql, districts }, port);
console.log(`zone: ${zone.roomNames.join(", ")} on :${port}`);

let closing = false;
const stop = async (): Promise<void> => {
  if (closing) return;
  closing = true;
  await zone.close();
  await sql.end();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
