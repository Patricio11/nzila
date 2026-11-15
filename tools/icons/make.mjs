// node tools/icons/make.mjs
//
// Draws the game's icons for a phone's screen from the house mark (the road
// that is the Z of Nzila, with its sun) and writes them as pictures into
// apps/client/public/icons. The colours are read from the interface's own
// tokens, so the icon is always the game's night, light and gold.
//
// Run it again when the mark or the tokens change; the pictures are in git.

import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// The shots tool's own browser draws them.
const { chromium } = createRequire(join(root, "tools", "shots", "shoot.mjs"))("playwright");

const tokens = readFileSync(join(root, "packages", "ui", "src", "tokens.css"), "utf8");
const token = (name) => {
  const found = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(tokens);
  if (!found) throw new Error(`tokens.css has no --${name}`);
  return found[1];
};
const night = token("n-noite");
const light = token("n-luz");
const gold = token("n-dourado");

/** The mark on its ground. `inset` is how much of the square is left empty round it: more for a maskable icon. */
const picture = (size, inset) => `<!doctype html><html><body style="margin:0;background:${night}">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${night}"/>
  <g transform="translate(50 52) scale(${(1 - inset * 2).toFixed(3)}) translate(-50 -52)">
    <path d="M24 30H76L24 82H76" fill="none" stroke="${light}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M24 30H76L24 82H76" fill="none" stroke="${night}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="6.5 7"/>
    <circle cx="80" cy="14" r="8.5" fill="${gold}"/>
  </g>
</svg></body></html>`;

const out = join(root, "apps", "client", "public", "icons");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, size, inset] of [
    ["icon-192.png", 192, 0.06],
    ["icon-512.png", 512, 0.06],
    ["icon-maskable-512.png", 512, 0.17],
    ["apple-touch-icon.png", 180, 0.1],
  ]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(picture(size, inset));
    await page.screenshot({ path: join(out, name), type: "png" });
    await page.close();
    console.log(`icons: ${name}  ${size}x${size}`);
  }
} finally {
  await browser.close();
}
