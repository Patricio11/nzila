// node tools/shots/conta.mjs "<path and query of a /cena picture>"
//
// What a picture is made of, piece by piece: every model that is drawn in it, with its triangles, biggest first.
// For tracing a picture that is over the reference phone's budget (120 000 triangles) to what puts it there.
// It serves the client as it was last built (run `pnpm build` first) at the phone's size.
//
//   node tools/shots/conta.mjs "/cena?pack=zango&hour=16&tier=normal&at=171.5,96,1.7&look=176,120,1.2"

/* global window */
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 4197;
const path = process.argv[2];
if (!path?.startsWith("/cena")) {
  console.error('usage: node tools/shots/conta.mjs "/cena?pack=…&at=…&look=…"');
  process.exit(1);
}
const server = spawn("pnpm", ["--filter", "@nzila/client", "exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore", shell: true });
const stop = () => {
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill();
};
try {
  for (let n = 0; n < 60; n++) {
    if (await fetch(`http://localhost:${PORT}/`).then((answer) => answer.ok, () => false)) break;
    await wait(500);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${PORT}${path}`);
  await page.waitForFunction(() => window.__cena?.stream && window.__cena.stream.loading === 0 && window.__cena.stream.shown > 0, undefined, { timeout: 90_000 });
  await wait(6000);
  const counted = await page.evaluate(() => {
    const rows = new Map();
    const scene = window.__cenaScene;
    scene.traverseVisible((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      const geometry = node.geometry;
      const triangles = ((geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3) * (node.isInstancedMesh ? node.count : 1);
      // Named by the nearest thing above it that has a name, and how far it is from the camera.
      let named = node;
      while (named && !named.name) named = named.parent;
      const key = (named?.name || node.type).replace(/[-_.]?\d+$/g, "").slice(0, 28);
      const row = rows.get(key) ?? { models: 0, triangles: 0 };
      row.models += 1;
      row.triangles += Math.round(triangles);
      rows.set(key, row);
    });
    return { said: window.__cena.triangles, draws: window.__cena.draws, rows: [...rows].sort((a, b) => b[1].triangles - a[1].triangles) };
  });
  console.log(`the picture: ${counted.said} triangles in ${counted.draws} draws (the renderer's count; a model out of sight is in the list below and not in this)`);
  let sum = 0;
  for (const [name, row] of counted.rows) {
    sum += row.triangles;
    console.log(`${String(row.triangles).padStart(8)}  ${String(row.models).padStart(4)} model(s)  ${name}`);
  }
  console.log(`${String(sum).padStart(8)}  everything that is set to be drawn`);
  await browser.close();
} finally {
  stop();
}
