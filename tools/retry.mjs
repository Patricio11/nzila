// node tools/retry.mjs <times> <command...>
//
// Runs a command, and runs it again if it fails, up to <times> runs in all.
// For the one stage of the gate that fails for no fault of the code: a
// browser engine that now and then does not start (finding F-131). A real
// failure fails every time and is reported as before; a second run that
// passes is said out loud, so that a flaky stage is seen and not hidden.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const [timesText, ...command] = process.argv.slice(2);
const times = Number(timesText);
if (!Number.isInteger(times) || times < 1 || command.length === 0) {
  console.error("usage: node tools/retry.mjs <times> <command...>");
  process.exit(2);
}

for (let run = 1; run <= times; run++) {
  const result = spawnSync(command.join(" "), { stdio: "inherit", shell: true });
  if (result.status === 0) {
    if (run > 1) console.log(`retry: passed on run ${run} of ${times}. The first failure was not the code's; it is worth a line in docs/FINDINGS.md if it keeps happening.`);
    process.exit(0);
  }
  if (run < times) {
    console.log(`retry: run ${run} of ${times} failed; clearing the test browsers' cache and running again.`);
    for (const dir of [".vitest", "node_modules/.vitest"]) rmSync(dir, { recursive: true, force: true });
  } else process.exit(result.status ?? 1);
}
