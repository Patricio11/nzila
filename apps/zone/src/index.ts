// Starts a zone for one district.
//   ZONE_PORT   where it listens (2567)
//   ZONE_PACK   the built pack of the district it runs: a folder with a manifest.json
//               (the development pack of Marginal e Baixa, when not given)
//   DATABASE_URL

import { pathToFileURL } from "node:url";
import { connect } from "@nzila/db";
import { loadDistrict } from "./district.ts";
import { startZone } from "./server.ts";

const port = Number(process.env.ZONE_PORT ?? 2567);
const pack = process.env.ZONE_PACK ? pathToFileURL(`${process.env.ZONE_PACK}/`) : new URL("../../client/public/packs/l1/", import.meta.url);

const sql = connect();
const district = await loadDistrict(pack);
const zone = await startZone({ sql, district }, port);
console.log(`zone: ${district.id} as "${zone.roomName}" on :${port}`);

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
