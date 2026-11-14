// pnpm shots <label>
//
// Builds nothing: it serves the client as it was last built (run `pnpm build`
// first), opens each page below in a real browser at phone and desktop size,
// and saves what it sees under screenshots/<label>/. The folder is not in
// git: it is for the founder and the team to look at.
//
//   screenshots/
//     0.7-styleguide/            one folder per task or occasion
//       styleguide_phone.png     <page>_<size>.png
//       styleguide_desktop.png
//       frontdoor_phone.png
//       ...
//       report.txt               what was checked on each page
//
// It also fails when a page scrolls sideways or logs an error, which no unit
// test can see.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const label = process.argv[2];
if (!label || !/^[A-Za-z0-9._-]+$/.test(label)) {
  console.error("usage: pnpm shots <label>   for example: pnpm shots 0.7-styleguide");
  process.exit(1);
}

const PAGES = [
  ["frontdoor", "/"],
  ["styleguide", "/styleguide"],
  ["bench", "/bench"],
  ["cena-dourada", "/cena?hour=17.4&still"],
  ["cena-meio-dia", "/cena?hour=12&still"],
  ["cena-por-do-sol", "/cena?hour=17.95&still"],
  ["cena-noite", "/cena?hour=22&still"],
  ["cena-normal", "/cena?hour=17.4&tier=normal&still"],
  ["cena-alta", "/cena?hour=17.4&tier=alta&still"],
  ["bairro-poupanca", "/cena?pack=dev&hour=17.4&tier=poupanca&at=60,96"],
  ["bairro-normal", "/cena?pack=dev&hour=17.4&tier=normal&at=60,96"],
  ["bairro-noite", "/cena?pack=dev&hour=21&tier=normal&at=60,96"],
];
const SIZES = [
  ["phone", 360, 740],
  ["desktop", 1280, 900],
];
const PORT = 4173;
const out = join(root, "screenshots", label);
mkdirSync(out, { recursive: true });

const server = spawn("pnpm", ["--filter", "@nzila/client", "exec", "vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: root,
  shell: true,
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("the preview server did not start. Run `pnpm build` first.");
}

const report = [`${label}, taken ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, ""];
let problems = 0;
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  for (const [pageName, path] of PAGES) {
    for (const [sizeName, width, height] of SIZES) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
      const errors = [];
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle" });
      await page.evaluate("document.fonts.ready");
      // A page that draws a 3D scene needs a moment to put its first frames on screen.
      await page.waitForTimeout(path.includes("pack=") ? 2500 : 900);
      const sideways = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
      const file = `${pageName}_${sizeName}.png`;
      await page.screenshot({ path: join(out, file), fullPage: true });
      await page.close();
      const faults = [...(sideways > 0 ? [`scrolls sideways by ${sideways} px`] : []), ...errors.map((e) => `error: ${e}`)];
      problems += faults.length;
      report.push(`${file}  ${width}x${height}  ${faults.length ? faults.join("; ") : "ok"}`);
    }
  }
  // Movement cannot be seen in a still: one slow scroll down each long page, as a video.
  for (const [pageName, path] of PAGES) {
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, recordVideo: { dir: out, size: { width: 390, height: 780 } } });
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle" });
    const tall = await page.evaluate("document.documentElement.scrollHeight");
    for (let y = 0; y < tall - 780; y += 26) {
      await page.evaluate(`window.scrollTo(0, ${y})`);
      await page.waitForTimeout(110);
    }
    await page.waitForTimeout(1500);
    const video = page.video();
    await context.close();
    const file = `${pageName}_motion.webm`;
    await video.saveAs(join(out, file));
    await video.delete();
    report.push(`${file}  390x780  a slow scroll, to see what moves`);
  }
} finally {
  await browser?.close();
  // On Windows the server is a tree of processes; taskkill takes the whole tree.
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill();
}

writeFileSync(join(out, "report.txt"), `${report.join("\n")}\n`);
console.log(report.join("\n"));
console.log(`\nsaved in screenshots/${label}/`);
if (problems > 0) {
  console.error(`${problems} problem(s) found.`);
  process.exit(1);
}
