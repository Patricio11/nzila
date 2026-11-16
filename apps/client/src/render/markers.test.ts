// The sign over a place shows a house glyph named in the district's manifest.
// A name the game has not drawn falls back to the pin, so a district never
// breaks the picture; but the districts we build must name only what exists.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GLYPHS } from "@nzila/ui";
import { describe, expect, test } from "vitest";
import { DEFAULT_GLYPH, glyphOf } from "./markers.ts";

describe("the glyph of a place", () => {
  test("is the one the manifest names, or the pin when it names none or one that is not drawn", () => {
    expect(glyphOf("cinema")).toBe("cinema");
    expect(glyphOf(undefined)).toBe(DEFAULT_GLYPH);
    expect(glyphOf("nave-espacial")).toBe(DEFAULT_GLYPH);
    expect(glyphOf("toString")).toBe(DEFAULT_GLYPH);
    expect(GLYPHS[DEFAULT_GLYPH]).toBeTruthy();
  });

  test.each(["l1", "dev"])("every place of %s names a glyph that is drawn", (pack) => {
    const built = fileURLToPath(new URL(`../../public/packs/${pack}/manifest.json`, import.meta.url));
    // The districts are made with Blender; a machine without it has none to read.
    if (!existsSync(built)) return;
    const manifest = JSON.parse(readFileSync(built, "utf8")) as { pois: { id: string; glyph?: string }[] };
    expect(manifest.pois.filter((poi) => poi.glyph !== undefined && !Object.hasOwn(GLYPHS, poi.glyph)).map((poi) => `${poi.id}: ${poi.glyph}`)).toEqual([]);
  });
});
