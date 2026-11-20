// "No Makuta literal in code" (Task 4.7): every amount of money a player pays or is paid comes from the rules
// files (tunables/*.json) or from the ledger, never from a number written in the code, so that every price and pay
// can be read, checked and changed in one place. This reads the game's code and fails on an amount written in it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");
/** Pages the team uses with sample amounts in them, the servers the tests run, and the tests themselves: not the game. */
const NOT_THE_GAME = /(\.test\.tsx?$|e2e-server\.ts$|[\\/](styleguide|bench|cena|corpo)[\\/]|[\\/]dist[\\/]|[\\/]node_modules[\\/])/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name === "dist" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !NOT_THE_GAME.test(path) ? [path] : [];
  });
}

/** What a money amount written in code looks like: a name of money given a number, or a number of Makuta in text. */
const AMOUNT = /\b(amount|price|pay|bill|total|fare|wage|leastMk|mostMk|makuta|cash|bank)\s*[:=]\s*[1-9]\d*\b|\b\d[\d.]*\s?Mk\b|makuta\(\s*\d/;

/** The lines of a file that write an amount, comments aside. */
function amountsIn(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "").replace(/\/\*.*?\*\//g, ""))
    .filter((line) => AMOUNT.test(line));
}

describe("money in code (Task 4.7)", () => {
  test("the rule catches an amount written in code, and lets comments and names be", () => {
    expect(amountsIn(`const fare = 200;\nconst label = "1.500 Mk";\nsay(tr.makuta(250));`)).toHaveLength(3);
    expect(amountsIn(`// a corrida is 200 Mk\nconst fare = rules.fares.candongueiroLocal;\n * paid 300 Mk`)).toEqual([]);
  });

  test("no amount of Makuta is written in the game's code: they all come from the rules files and the ledger", () => {
    const found = [...sources(join(ROOT, "apps")), ...sources(join(ROOT, "packages"))].flatMap((path) =>
      amountsIn(readFileSync(path, "utf8")).map((line) => `${relative(ROOT, path)}: ${line.trim()}`),
    );
    expect(found).toEqual([]);
  });
});
