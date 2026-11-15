// The card of origin is put together from words of the catalog whose keys
// come from the table of origins. Every family, trade, bairro and province
// the table can deal must have its words, or a card shows an id.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BASE_ORIGINS } from "@nzila/economy";
import { ptAO } from "@nzila/i18n";
import { CATALOGUE } from "@nzila/protocol";
import { expect, test } from "vitest";

test("everything the table of origins can deal has its words", () => {
  const needed = new Set<string>();
  for (const family of BASE_ORIGINS.families) {
    needed.add(`origin.line.${family.id}`);
    needed.add(`origin.trade.${family.pai}`);
    needed.add(`origin.trade.${family.mae}`);
    needed.add(`origin.tier.${family.tier}`);
    for (const bairro of family.bairros) needed.add(`origin.bairro.${bairro}`).add(`origin.bairro.${bairro}.em`);
  }
  for (const province of BASE_ORIGINS.provinces) needed.add(`origin.province.${province.id}.de`);
  expect([...needed].filter((key) => !(key in ptAO))).toEqual([]);
  // And the catalog carries no word for a thing the table no longer has.
  const kept = Object.keys(ptAO).filter((key) => /^origin\.(line|trade|tier|bairro|province)\./.test(key));
  expect(kept.filter((key) => !needed.has(key))).toEqual([]);
});

test("a place is said with its own preposition (D-0.50)", () => {
  for (const [key, text] of Object.entries(ptAO)) {
    if (/^origin\.bairro\..*\.em$/.test(key)) expect(text, key).toMatch(/^(em|no|na) \p{Lu}/u);
    if (/^origin\.province\..*\.de$/.test(key)) expect(text, key).toMatch(/^(de|do|da) \p{Lu}/u);
  }
});

test("the catalogue the server checks a look against is the wardrobe as it was built", ({ skip }) => {
  const built = fileURLToPath(new URL("../../public/packs/guarda-roupa/guarda-roupa.json", import.meta.url));
  // The wardrobe is made with Blender; a machine without it has none to compare.
  if (!existsSync(built)) return skip();
  const wardrobe = JSON.parse(readFileSync(built, "utf8")) as Record<"f" | "m", { bodies: Record<string, Record<string, unknown>>; hair: Record<string, unknown>; extras?: Record<string, unknown> }>;
  for (const sex of ["f", "m"] as const) {
    expect(Object.fromEntries(Object.entries(wardrobe[sex].bodies).map(([top, below]) => [top, Object.keys(below)]))).toEqual(CATALOGUE[sex].tops);
    expect(Object.keys(wardrobe[sex].hair)).toEqual(CATALOGUE[sex].hair);
    expect(Object.keys(wardrobe[sex].extras ?? {})).toEqual(CATALOGUE[sex].extras);
  }
});
