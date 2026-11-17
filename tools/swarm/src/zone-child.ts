// A zone as the phase's verification runs it (verify.ts): a process of its
// own, so that it can be killed outright, announcing itself under keys of its
// own in Redis so that nobody else's zone or API hears of it.
//
//   ZONE_PORT=2591 VERIFY_PREFIX=nzila-verify node tools/swarm/src/zone-child.ts
//
// It runs the first open district of the registry from the pack the client was built with, and
// lets in seats only: every player in it came through the matchmaker, as a phone does.

import { existsSync } from "node:fs";
import { connect, loadWorldSeed } from "@nzila/db";
import { BASE_TUNABLES } from "@nzila/economy";
import { loadChatFilter } from "@nzila/i18n/server";
import { redisPresence, redisUrl } from "@nzila/presence";
import { loadDistrict } from "../../../apps/zone/src/district.ts";
import { startZone } from "../../../apps/zone/src/server.ts";

const open = (await loadWorldSeed()).districts.find((one) => one.open);
if (!open) throw new Error("zone-child: the registry has no open district");
const folder = new URL(`../../../apps/client/public/packs/${open.id.split("/")[1]}/`, import.meta.url);
if (!existsSync(new URL("manifest.json", folder))) throw new Error(`zone-child: the pack of ${open.id} is not built (pnpm pack:l1)`);
const sql = connect(undefined, 10);
const presence = await redisPresence(redisUrl(), process.env.VERIFY_PREFIX ?? "nzila-verify");
const port = Number(process.env.ZONE_PORT ?? 2591);
const zone = await startZone({ sql, districts: [{ district: await loadDistrict(folder) }], presence, address: `ws://127.0.0.1:${port}`, holds: BASE_TUNABLES.channels.cap, filter: loadChatFilter() }, port);
console.log(`zone-child: ${zone.id} on ${port}`);
