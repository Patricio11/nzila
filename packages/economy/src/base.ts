// The starter tunables, checked as they are loaded. Zone, API and worker load
// the live file through the Estúdio's versioning from Task 4.6; until then,
// and in tests and local play, this is the set of numbers the game runs on.

import base from "../tunables/base.json" with { type: "json" };
import { parseTunables, type Tunables } from "./tunables.ts";

export const BASE_TUNABLES: Tunables = parseTunables(base);
