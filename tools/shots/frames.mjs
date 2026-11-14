// node tools/shots/frames.mjs <film> <out dir> [stills] [columns]
//
// Takes stills at even intervals from a reference film (a dancer, a street)
// and lays them on sheets, so that a movement can be studied frame by frame
// and keyed by hand. It plays the film in the machine's own browser (Edge or
// Chrome), because the browsers the tests use cannot play ordinary video.
//
// Reference films are other people's work: they are looked at, never shipped,
// and the folders they live in are not in git.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, join, resolve } from "node:path";
import { chromium } from "playwright";

const [film, outDir, stillsArg, columnsArg] = process.argv.slice(2);
if (!film || !outDir) {
  console.error("usage: node tools/shots/frames.mjs <film> <out dir> [stills] [columns]");
  process.exit(1);
}
const stills = Number(stillsArg) || 48;
const columns = Number(columnsArg) || 8;
const out = resolve(outDir);
mkdirSync(out, { recursive: true });

// The film is served from this machine to the page: a page may not read a file by its path.
const bytes = readFileSync(resolve(film));
const server = createServer((request, response) => {
  if (request.url === "/film") {
    const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? "");
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Number(range[2]) : bytes.length - 1;
    response.writeHead(range ? 206 : 200, { "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": end - start + 1, ...(range ? { "content-range": `bytes ${start}-${end}/${bytes.length}` } : {}) });
    response.end(bytes.subarray(start, end + 1));
  } else {
    response.writeHead(200, { "content-type": "text/html" });
    response.end('<body style="margin:0;background:#111"><video id="v" src="/film" muted playsinline style="display:block;height:100vh"></video>');
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const address = `http://127.0.0.1:${server.address().port}/`;

let browser;
for (const channel of ["msedge", "chrome"]) {
  try {
    browser = await chromium.launch({ channel });
    break;
  } catch {
    // try the next one
  }
}
if (!browser) {
  console.error("Neither Edge nor Chrome could be started to play the film.");
  process.exit(1);
}
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  await page.goto(address);
  await page.waitForFunction("document.getElementById('v').readyState >= 1", undefined, { timeout: 30000 });
  const info = await page.evaluate("(() => { const v = document.getElementById('v'); return { seconds: v.duration, width: v.videoWidth, height: v.videoHeight }; })()");
  const wide = Math.round((960 * info.width) / info.height);
  await page.setViewportSize({ width: Math.max(200, wide), height: 960 });
  const names = [];
  for (let i = 0; i < stills; i++) {
    const at = (info.seconds * (i + 0.5)) / stills;
    await page.evaluate(`new Promise((done) => { const v = document.getElementById('v'); v.onseeked = () => requestAnimationFrame(() => done()); v.currentTime = ${at}; })`);
    const name = `f${String(i).padStart(3, "0")}_${at.toFixed(2)}s.jpg`;
    await page.locator("#v").screenshot({ path: join(out, name), type: "jpeg", quality: 70 });
    names.push(name);
  }
  // The stills on sheets, a few rows each, small enough to read at a glance.
  const perSheet = columns * 3;
  for (let s = 0; s * perSheet < names.length; s++) {
    const cells = names.slice(s * perSheet, (s + 1) * perSheet).map((n) => `<figure><img src="${n}"><figcaption>${n.slice(5, -4)}</figcaption></figure>`).join("");
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:8px;background:#111;color:#ddd;font:11px system-ui}.g{display:grid;grid-template-columns:repeat(${columns},1fr);gap:6px}figure{margin:0}img{width:100%;display:block}</style><div class="g">${cells}</div>`;
    writeFileSync(join(out, `sheet_${s + 1}.html`), html);
    const sheet = await browser.newPage({ viewport: { width: 1800, height: 900 } });
    await sheet.goto(`file://${join(out, `sheet_${s + 1}.html`).replaceAll("\\", "/")}`);
    await sheet.waitForLoadState("networkidle");
    await sheet.screenshot({ path: join(out, `sheet_${s + 1}.jpg`), type: "jpeg", quality: 72, fullPage: true });
    await sheet.close();
  }
  console.log(`${basename(film)}: ${info.seconds.toFixed(1)} s, ${info.width}x${info.height}, ${stills} stills in ${out}`);
} finally {
  await browser.close();
  server.close();
}
