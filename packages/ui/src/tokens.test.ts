// Readable-In-The-Sun Rule: every pair of text and surface the HUD uses meets
// WCAG AA, and text on a scrim meets it over the brightest and the darkest
// frame the world can put behind it.

import { readFile, stat } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const css = await readFile(new URL("./tokens.css", import.meta.url), "utf8");

type Rgba = readonly [number, number, number, number];

function token(name: string): Rgba {
  const value = new RegExp(`--n-${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
  if (!value) throw new Error(`no token --n-${name}`);
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1];
  if (hex) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1];
  const parts = /^rgba\(([^)]+)\)$/.exec(value)?.[1]?.split(",").map(Number);
  if (parts?.length === 4) return parts as unknown as Rgba;
  throw new Error(`--n-${name} is not a colour this test can read: ${value}`);
}

/** A colour with transparency laid over an opaque one. */
function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3];
  return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;
/** Large or bold text, and glyphs: WCAG asks 3. */
const AA_LARGE = 3;

describe("text on its surface", () => {
  const pairs: readonly (readonly [string, string, number])[] = [
    ["luz", "noite", AA],
    ["luz", "noite-2", AA],
    ["luz-suave", "noite", AA],
    ["luz-suave", "noite-2", AA],
    ["tinta", "papel", AA],
    ["tinta", "papel-2", AA],
    ["tinta-suave", "papel", AA],
    ["tinta", "dourado", AA],
    ["tinta", "luz", AA],
    ["azul", "luz", AA],
    ["azul", "papel", AA],
    // Makuta in and out, on the solid chip they flash on.
    ["ganho", "noite", AA],
    ["calor-2", "noite", AA],
    // Heat glyphs and the shield, on the dark line they sit on.
    ["calor-1", "noite", AA_LARGE],
    ["calor-3", "noite", AA_LARGE],
    ["escudo", "noite", AA_LARGE],
    ["mar", "noite", AA_LARGE],
  ];
  test.each(pairs)("%s on %s", (text, surface, needed) => {
    expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(needed);
  });
});

describe("text on the scrim, over the world", () => {
  // The brightest thing the world shows is the sun on white paint; the darkest is a street at night.
  const brightest: Rgba = [255, 255, 255, 1];
  const darkest: Rgba = [0, 0, 0, 1];

  test("light text reads over the brightest frame and the darkest", () => {
    expect(contrast(token("luz"), over(token("scrim"), brightest))).toBeGreaterThanOrEqual(AA);
    expect(contrast(token("luz"), over(token("scrim"), darkest))).toBeGreaterThanOrEqual(AA);
  });
});

describe("the display typeface", () => {
  test("is one self-hosted file under 40 KB", async () => {
    const { size } = await stat(new URL("../fonts/fraunces-pt.woff2", import.meta.url));
    expect(size).toBeLessThan(40_000);
    expect(css.match(/@font-face/g)?.length).toBe(1);
    expect(css).not.toMatch(/https?:\/\//);
  });
});
