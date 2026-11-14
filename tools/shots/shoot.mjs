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
//       index.html               every picture on one page
//       todas_1.png ...          the same, as pictures: look at ALL of them before calling a task done
//
// It also fails when a page scrolls sideways or logs an error, which no unit
// test can see.

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const label = process.argv[2];
if (!label || !/^[A-Za-z0-9._-]+$/.test(label)) {
  console.error("usage: pnpm shots <label>   for example: pnpm shots 0.7-styleguide");
  process.exit(1);
}

// The district is 256 m by 192 m: streets every 64 m, the promenade and the bay along the south.
const RUA = "at=70,97.6,1.65&look=130,95,7";
const ESQUINA = "at=103,104&look=116,88,5";
const PAGES = [
  ["frontdoor", "/"],
  ["styleguide", "/styleguide"],
  ["bench", "/bench"],
  ["bench-feito", "/bench?auto&seconds=3"],
  ["corpo-fila", "/corpo?hour=16.6"],
  ["corpo-fila-tras", "/corpo?hour=16.6&ang=180"],
  ["corpo-fila-lado", "/corpo?hour=12&ang=55"],
  ["corpo-fila-poupanca", "/corpo?hour=12&tier=poupanca"],
  ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((n) => [[`corpo-${n}`, `/corpo?hour=16.6&quem=${n}&ang=20`], [`corpo-${n}-rosto`, `/corpo?hour=15&quem=${n}&perto&ang=18`]]),
  ["corpo-2-tras", "/corpo?hour=16.6&quem=0&ang=160"],
  ["hud", "/andar?hour=16.8&cam=200"],
  ...["acenar", "rir", "aplaudir", "chamar", "dancar"].map((g, i) => [`hud-${g}`, `/andar?hour=16.8&cam=${i % 2 ? 150 : 30}&quem=${i + 1}&gesto=${g}`]),
  ["ela-joelhos-lado", "/andar?hour=15&cam=90&quem=6&gesto=dancar&t=6.0&pausa"],
  ["ela-joelhos-frente", "/andar?hour=15&cam=20&quem=2&gesto=dancar&t=6.1&pausa"],
  ["hud-sentar", "/andar?hour=16.8&cam=40&quem=4&sentar"],
  ["hud-sentar-calcas", "/andar?hour=12&cam=320&quem=1&sentar"],
  ["hud-esquerda", "/andar?hour=16.8&cam=200&mao=esquerda&quem=2"],
  ["marginal-dourada", "/cena?hour=17.4&tier=normal&still"],
  ["marginal-poupanca", "/cena?hour=17.4&tier=poupanca&still"],
  ["marginal-alta", "/cena?hour=17.4&tier=alta&still"],
  ["marginal-meio-dia", "/cena?hour=12&tier=normal&still"],
  ["marginal-por-do-sol", "/cena?hour=17.95&tier=normal&still"],
  ["marginal-noite", "/cena?hour=21&tier=normal&still"],
  ["marginal-noite-poupanca", "/cena?hour=21&tier=poupanca&still"],
  ["rua-dourada", `/cena?hour=17.4&tier=normal&${RUA}`],
  ["rua-poupanca", `/cena?hour=17.4&tier=poupanca&${RUA}`],
  ["rua-manha", `/cena?hour=8&tier=normal&${RUA}`],
  ["rua-noite", `/cena?hour=21&tier=normal&${RUA}`],
  ["esquina-dourada", `/cena?hour=17.4&tier=normal&${ESQUINA}`],
  ["esquina-poupanca", `/cena?hour=12&tier=poupanca&${ESQUINA}`],
  ["bairro-dia", "/cena?hour=10&tier=normal&at=26,31,1.7&look=66,32,3"],
  ["bairro-dourada", "/cena?hour=17.3&tier=normal&at=84,31,1.7&look=40,32,3"],
  ["bairro-poupanca", "/cena?hour=15&tier=poupanca&at=26,31,1.7&look=66,32,3"],
  ["bairro-noite", "/cena?hour=20.5&tier=normal&at=26,31,1.7&look=66,32,3"],
  ["bairro-quintal", "/cena?hour=16&tier=normal&at=112,34,1.7&look=120,14,2"],
  ["bairro-do-alto", "/cena?hour=15&tier=alta&at=96,70,34&look=96,24,0"],
  ["baia", "/cena?hour=17.4&tier=normal&at=140,176,1.8&look=200,215,2"],
  ["baia-meio-dia", "/cena?hour=12&tier=poupanca&at=140,176,1.8&look=200,215,2"],
  ["do-alto", "/cena?hour=15&tier=alta&at=128,210,46&look=128,110,0"],
];
/** Pages whose movement is worth a film: the interface, and one walk down the promenade. */
const FILMS = [
  ["styleguide", "/styleguide"],
  ["passeio", "/cena?hour=17.4&tier=normal"],
  ["andar-frente", "/andar?auto&cam=75&quem=1&hour=16.8"],
  ["andar-gestos", "/andar?auto&cam=200&quem=3&hour=16.8"],
  ["danca-frente", "/andar?cam=0&quem=1&hour=16.8&gesto=dancar"],
  ["danca-lado", "/andar?cam=95&quem=5&hour=16.8&gesto=dancar"],
  ["danca-pano", "/andar?cam=20&quem=0&hour=16.8&gesto=dancar"],
  ["danca-ela", "/andar?cam=110&quem=6&hour=16.8&gesto=dancar"],
  ["andar-lado", "/andar?auto&cam=0&quem=0&hour=16.8"],
  ["andar-tras", "/andar?auto&cam=270&quem=5&hour=16.8"],
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
const taken = [];
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const only = process.argv[3];
  for (const [pageName, path] of PAGES) {
    // `pnpm shots <label> corpo` takes only the pages whose name begins that way.
    if (only && !pageName.startsWith(only)) continue;
    for (const [sizeName, width, height] of SIZES) {
      // A face fills either screen the same way: once is enough.
      if (pageName.endsWith("-rosto") && sizeName === "phone") continue;
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
      const errors = [];
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle" });
      await page.evaluate("document.fonts.ready");
      // A page that draws the world is ready when every chunk it wants is on screen; a bench, when it has its result.
      if (path.startsWith("/cena")) {
        await page.waitForFunction("window.__cena?.stream ? window.__cena.stream.shown > 0 && window.__cena.stream.shown === window.__cena.stream.wanted && window.__cena.stream.loading === 0 : false", undefined, { timeout: 30000 }).catch(() => errors.push("the world never finished arriving"));
      }
      if (path.startsWith("/corpo")) await page.waitForFunction("window.__corpo !== undefined", undefined, { timeout: 30000 }).catch(() => errors.push("the people never arrived"));
      if (path.startsWith("/andar")) {
        await page.waitForFunction("window.__andar?.ready === true", undefined, { timeout: 30000 }).catch(() => errors.push("the person never arrived"));
        await page.waitForTimeout(pageName.startsWith("ela-") ? 1900 : 3000);
      }
      if (path.includes("auto") && path.startsWith("/bench")) await page.waitForFunction("window.__bench !== undefined", undefined, { timeout: 60000 });
      await page.waitForTimeout(path === "/bench" ? 3500 : 900);
      const sideways = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
      const file = `${pageName}_${sizeName}.png`;
      await page.screenshot({ path: join(out, file), fullPage: true });
      await page.close();
      const faults = [...(sideways > 0 ? [`scrolls sideways by ${sideways} px`] : []), ...errors.map((e) => `error: ${e}`)];
      problems += faults.length;
      report.push(`${file}  ${width}x${height}  ${faults.length ? faults.join("; ") : "ok"}`);
      taken.push(file);
    }
  }
  // Movement cannot be seen in a still: one slow scroll down each long page, as a video.
  for (const [pageName, path] of FILMS) {
    if (only && !pageName.startsWith(only)) continue;
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, recordVideo: { dir: out, size: { width: 390, height: 780 } } });
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle" });
    const tall = await page.evaluate("document.documentElement.scrollHeight");
    for (let y = 0; y < tall - 780; y += 26) {
      await page.evaluate(`window.scrollTo(0, ${y})`);
      await page.waitForTimeout(110);
    }
    if (path.startsWith("/andar")) {
      await page.waitForFunction("window.__andar?.ready === true", undefined, { timeout: 30000 }).catch(() => report.push(`${pageName}: the person never arrived`));
      // Stills out of the film, to look at the stride without playing it.
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(i === 0 ? 1200 : 1000);
        await page.screenshot({ path: join(out, `${pageName}_${i}.png`) });
      }
    }
    await page.waitForTimeout(path.startsWith("/cena") ? 9000 : 1500);
    const video = page.video();
    await context.close();
    const file = `${pageName}_motion.webm`;
    await video.saveAs(join(out, file));
    await video.delete();
    report.push(`${file}  390x780  a slow scroll, to see what moves`);
  }
  // Every picture on one page (index.html), and that page as pictures (todas_N.png): nothing is
  // judged from three screenshots out of thirty.
  const cell = (file) => `<figure><img src="${file}" loading="lazy"><figcaption>${file.replace(".png", "")}</figcaption></figure>`;
  const sheet = (files, columns) => `<!doctype html><meta charset="utf-8"><title>${label}</title><style>body{margin:16px;background:#1b1d24;color:#eee;font:13px system-ui}.g{display:grid;grid-template-columns:repeat(${columns},1fr);gap:12px;align-items:start}figure{margin:0}img{width:100%;display:block;border-radius:6px;max-height:760px;object-fit:cover;object-position:top}figcaption{padding:4px 0 8px}</style><div class="g">${files.map(cell).join("")}</div>`;
  writeFileSync(join(out, "index.html"), sheet(taken, 4));
  // The world, which is what has to be judged at a glance; the long interface pages are read one by one.
  const world = taken.filter((f) => !f.startsWith("styleguide") && !f.startsWith("frontdoor"));
  const groups = [world.filter((f) => f.endsWith("_phone.png")), world.filter((f) => f.endsWith("_desktop.png"))];
  let n = 0;
  for (const [g, group] of groups.entries()) {
    const per = g === 0 ? 10 : 6;
    for (let i = 0; i < group.length; i += per) {
      n++;
      const name = `todas_${n}.html`;
      writeFileSync(join(out, name), sheet(group.slice(i, i + per), g === 0 ? 5 : 3));
      const page = await browser.newPage({ viewport: { width: 1900, height: 1000 } });
      await page.goto(`file://${join(out, name).replaceAll("\\", "/")}`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: join(out, `todas_${n}.png`), fullPage: true });
      await page.close();
      rmSync(join(out, name));
    }
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
