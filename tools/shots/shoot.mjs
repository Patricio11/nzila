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
  // The people of the street: two zungueiras, the police officer, the one who fishes.
  ...[8, 9, 10, 11].flatMap((n) => [[`rua-${n}`, `/corpo?hour=16.6&quem=${n}&ang=25`], [`rua-${n}-tras`, `/corpo?hour=15&quem=${n}&ang=200`]]),
  ["hud", "/andar?hour=16.8&cam=200"],
  ...["acenar", "rir", "aplaudir", "chamar", "dancar"].map((g, i) => [`hud-${g}`, `/andar?hour=16.8&cam=${i % 2 ? 150 : 30}&quem=${i + 1}&gesto=${g}`]),
  ["ela-joelhos-lado", "/andar?hour=15&cam=90&quem=6&gesto=dancar&t=6.0&pausa"],
  ["ela-joelhos-frente", "/andar?hour=15&cam=20&quem=2&gesto=dancar&t=6.1&pausa"],
  ["hud-sentar", "/andar?hour=16.8&cam=40&quem=4&sentar"],
  ["hud-sentar-calcas", "/andar?hour=12&cam=320&quem=1&sentar"],
  ["hud-esquerda", "/andar?hour=16.8&cam=200&mao=esquerda&quem=2"],
  // The candongueiro, parked at a paragem of the rehearsal town.
  ["carrinha-lado", "/cena?hour=15&tier=normal&at=115,101,1.6&look=115,93.3,1.0"],
  ["carrinha-frente", "/cena?hour=15&tier=normal&at=108,98,1.5&look=115,93.3,1.0"],
  ["carrinha-tras", "/cena?hour=16.8&tier=normal&at=122,98.5,1.9&look=115,93.3,0.9"],
  ["carrinha-porta", "/cena?hour=12&tier=normal&at=110.5,88.6,1.7&look=115.5,93.3,1.0"],
  ["carrinha-cima", "/cena?hour=12&tier=normal&at=119,99,5.5&look=115,93.3,0.8"],
  ["carrinha-noite", "/cena?hour=20.5&tier=normal&at=108,98,1.5&look=115,93.3,1.0"],
  // The vans on their linhas in Marginal e Baixa (transito=3: one stands at each line's first paragem).
  ["transito-paragem", "/cena?pack=l1&hour=16.5&tier=normal&transito=3&at=313,110.5,1.6&look=304,104.5,1.0"],
  ["transito-paragem-tras", "/cena?pack=l1&hour=12&tier=normal&transito=3&at=294,109.5,1.7&look=304,104.5,1.0"],
  ["transito-arranca", "/cena?pack=l1&hour=16.5&tier=normal&transito=22&at=300,97,3.2&look=325,105,1.0"],
  ["transito-mutamba", "/cena?pack=l1&hour=17.3&tier=normal&transito=3&at=227,161.5,1.7&look=237,156.5,1.0"],
  ["transito-do-alto", "/cena?pack=l1&hour=15&tier=alta&transito=60&at=224,40,70&look=224,120,0"],
  ["transito-noite", "/cena?pack=l1&hour=20.5&tier=normal&transito=3&at=313,110.5,1.6&look=304,104.5,1.0"],
  // The people of the street in Marginal e Baixa, at fixed moments of their timetables.
  ["gente-pescador", "/cena?pack=l1&hour=16.5&tier=normal&transito=30&at=367.5,53.5,1.6&look=362,48.8,1.1"],
  ["gente-pescador-lado", "/cena?pack=l1&hour=12&tier=normal&transito=30&at=357,50.5,1.5&look=362,48.8,1.2"],
  ["gente-policia-chama", "/cena?pack=l1&hour=16.5&tier=normal&transito=90.8&at=372,56,1.7&look=364,49.5,1.1"],
  ["gente-corrida", "/cena?pack=l1&hour=16.5&tier=normal&transito=95.5&at=336,61,1.8&look=347,54,1.0"],
  ["gente-passeio", "/cena?pack=l1&hour=17.2&tier=normal&transito=30&at=250,66.5,1.7&look=215,66,1.2"],
  ["gente-passeio-2", "/cena?pack=l1&hour=12&tier=normal&transito=200&at=300,63,1.7&look=340,58,1.2"],
  ["gente-do-alto", "/cena?pack=l1&hour=15&tier=alta&transito=30&at=230,36,26&look=230,70,0"],
  ["gente-mutamba", "/cena?pack=l1&hour=17&tier=normal&transito=10&at=247,170,1.7&look=238,165.5,1.1"],
  ["gente-bandeira", "/cena?pack=l1&hour=15&tier=normal&transito=20&at=226,103,1.8&look=209,116,6.5"],
  ["gente-bandeira-perto", "/cena?pack=l1&hour=12&tier=normal&transito=20&at=213,110.5,3.5&look=209.5,115.6,8.6"],
  ["gente-fortaleza", "/cena?pack=l1&hour=16.5&tier=alta&transito=20&at=95,70,6&look=45,95,16"],
  ["gente-zunga", "/cena?pack=l1&hour=15&tier=normal&transito=20&at=203,109,1.6&look=212,114.2,1.2"],
  ["gente-zunga-corrida", "/cena?pack=l1&hour=15&tier=normal&transito=42.5&at=186,110,1.7&look=200,114,1.1"],
  ["gente-posto", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=392,58,1.7&look=384,70,2.4"],
  ["gente-poupanca", "/cena?pack=l1&hour=17.2&tier=poupanca&transito=30&at=250,66.5,1.7&look=215,66,1.2"],
  ["viagem-espera", "/andar?pack=l1&em=302.5,107.4&cam=215&quem=2&hour=16.8&transito=3"],
  // Street name plates and the crossing's sign.
  ["placas-avenida", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=262,113.5,1.7&look=268.9,109.5,2.6"],
  ["placas-avenida-perto", "/cena?pack=l1&hour=12&tier=normal&transito=30&at=266.5,106,2.0&look=268.9,109.9,2.6"],
  ["placas-rua", "/cena?pack=l1&hour=16.5&tier=normal&transito=30&at=264,153.5,1.7&look=268.9,149.1,2.5"],
  ["placas-largo", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=190,157,1.7&look=191,162.2,2.6"],
  ["placas-passadeira", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=253,108,1.6&look=259.1,109.5,2.2"],
  // The jump, held at three moments of it.
  ["salto-inicio", "/andar?hour=16.8&cam=70&quem=1&salto=0.2"],
  ["salto-alto", "/andar?hour=16.8&cam=70&quem=1&salto=0.5"],
  ["salto-alto-ela", "/andar?hour=16.8&cam=110&quem=6&salto=0.5"],
  ["salto-alto-pano", "/andar?hour=16.8&cam=30&quem=0&salto=0.5"],
  ["salto-fim", "/andar?hour=16.8&cam=70&quem=3&salto=0.85"],
  // Marginal e Baixa. The bay is to the north; the shore is at about z=62 in the middle and z=24 at the ends.
  ["l1-do-alto", "/cena?pack=l1&hour=15&tier=alta&at=224,-70,95&look=224,110,0"],
  ["l1-do-alto-oeste", "/cena?pack=l1&hour=16.5&tier=alta&at=20,10,60&look=200,120,0"],
  ["l1-passeio", "/cena?pack=l1&hour=17.2&tier=normal&at=150,58,1.8&look=260,70,4"],
  ["l1-passeio-meio-dia", "/cena?pack=l1&hour=12&tier=normal&at=330,58,1.8&look=230,72,4"],
  ["l1-passeio-poupanca", "/cena?pack=l1&hour=17.2&tier=poupanca&at=150,58,1.8&look=260,70,4"],
  ["l1-rosa", "/cena?pack=l1&hour=16.5&tier=normal&at=176,78,1.8&look=222,128,10"],
  ["l1-avenida", "/cena?pack=l1&hour=10&tier=normal&at=270,106,1.8&look=180,96,6"],
  ["l1-miradouro", "/cena?pack=l1&hour=17.4&tier=alta&at=52,94,14.6&look=230,66,0"],
  ["l1-fortaleza", "/cena?pack=l1&hour=16&tier=normal&at=112,120,1.8&look=45,128,12"],
  ["l1-mutamba", "/cena?pack=l1&hour=16&tier=normal&at=194,166,1.8&look=240,176,4"],
  ["l1-ferro", "/cena?pack=l1&hour=15&tier=normal&at=300,160,1.8&look=284,180,5"],
  ["l1-mercado", "/cena?pack=l1&hour=11&tier=normal&at=112,160,1.8&look=140,172,2"],
  ["l1-igreja", "/cena?pack=l1&hour=16.5&tier=normal&at=224,203,1.8&look=224,220,9"],
  ["l1-pontao", "/cena?pack=l1&hour=17.6&tier=normal&at=226,36,1.9&look=226,90,8"],
  ["l1-noite", "/cena?pack=l1&hour=20.5&tier=normal&at=150,58,1.8&look=260,70,4"],
  ["l1-campos", "/cena?pack=l1&hour=15&tier=normal&at=276,66,1.8&look=320,82,1"],
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
  ["gente-andar", "/andar?pack=l1&em=352,54.5&cam=285&quem=1&hour=16.8&desde=76"],
  // Boarding at the Marginal paragem and riding to the next: the page boards by itself (&apanhar).
  ["viagem", "/andar?pack=l1&em=302.5,107.4&cam=200&quem=2&hour=16.8&desde=0&apanhar"],
  ["transito-andar", "/andar?pack=l1&em=297,107.2&cam=250&quem=4&hour=16.8"],
  // Jumping: on the spot, at a run, and over the planted strip of the Marginal's avenue.
  ["salto-parado", "/andar?salto&cam=70&quem=1&hour=16.8"],
  ["salto-corrida", "/andar?auto&salto&cam=20&quem=3&hour=16.8"],
  ["salto-separador", "/andar?pack=l1&em=170,97.5&auto=180&salto&cam=265&quem=6&hour=16.8"],
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
      // A jump is over in half a second: its stills are taken close together.
      const quick = pageName.startsWith("salto");
      for (let i = 0; i < (quick ? 30 : pageName.startsWith("viagem") ? 36 : 12); i++) {
        await page.waitForTimeout(quick ? 130 : i === 0 ? 1200 : 1000);
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
