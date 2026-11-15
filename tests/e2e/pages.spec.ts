declare global {
  interface Window {
    __provador?: { ready: boolean; look: { sex: string; hair: string; hairColour: string; top: string; bottom: string; extras?: string[]; tall?: number }; dressed: number };
    __cenaMoment?: (second: number) => void;
    __andar?: { x: number; z: number; speed: number; ready: boolean; seated: boolean; emote: string | null; action: string | null; lift: number; jumps: number; riding: string | null; sounds: number };
  }
}

import { expect, test, type Page } from "@playwright/test";
import { FPS_BUDGET, SHELL_BUDGET_BYTES, expectLooksTheSame, expectNoSidewaysScroll, slowPhone, watch } from "./harness.ts";

/** Turns the card of origin over, reads the Makuta on it, and goes on. */
async function turnCard(page: Page): Promise<string> {
  await page.waitForURL(/\/origem/);
  await page.getByRole("button", { name: "Virar a carta" }).click();
  const makuta = (await page.locator(".origem-makuta").textContent()) ?? "";
  expect(makuta).toMatch(/^\d[\d.]*\sMk$/);
  await page.getByRole("button", { name: "Começar a vida" }).click();
  return makuta;
}

/** Types a year of birth on the age question and confirms it. */
async function bornIn(page: Page, year: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "Em que ano nasceste?" })).toBeVisible();
  for (const digit of year) await page.getByRole("button", { name: digit, exact: true }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
}

test.describe("the front door", () => {
  test("opens on a slow phone inside the shell budget, with nothing wrong on it", async ({ page }, info) => {
    const slowed = await slowPhone(page);
    const seen = watch(page);
    const started = Date.now();
    await page.goto("/", { waitUntil: "networkidle" });
    const seconds = (Date.now() - started) / 1000;

    await expect(page.getByRole("img", { name: "Nzila" })).toBeVisible();
    await expectNoSidewaysScroll(page);
    expect(seen.errors).toEqual([]);

    // What the first visit cost, as the network carried it.
    info.annotations.push({ type: "first visit", description: `${(seen.bytes() / 1024).toFixed(1)} KB in ${seconds.toFixed(1)} s${slowed ? " on the slow profile" : ""}` });
    expect(seen.bytes()).toBeGreaterThan(10_000);
    expect(seen.bytes()).toBeLessThan(SHELL_BUDGET_BYTES);
    // Rule 2 gives a new player a minute to be in the world. The shell alone must take a small part of it.
    expect(seconds).toBeLessThan(10);
  });

  test("the display typeface arrives and is used", async ({ page }) => {
    await page.goto("/styleguide", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('700 28px "Fraunces"'))).toBe(true);
  });
});

test.describe("going in", () => {
  test("the door states what the first visit costs, the button goes in, megabytes are counted on the way, and the light door is remembered", async ({ page, request }, info) => {
    if (!(await request.get("/packs/front.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa or the people are not built (they need Blender). Going in was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await page.goto("/");
    await expect(page.locator(".frontdoor-cost")).toContainText(/A primeira entrada gasta \d+,\d\sMB de dados/);
    await expect(page.getByRole("link", { name: /Entrar em Modo Poupança \(\d+,\d\sMB\)/ })).toBeVisible();
    await page.getByRole("button", { name: "Entrar em Luanda" }).click();
    // Someone new is asked the year they were born, on the game's own keys.
    await bornIn(page, "1990");
    // Then they choose how they look; then they go in.
    await page.waitForURL(/\/provador/);
    await page.waitForFunction(() => window.__provador?.ready === true, undefined, { timeout: 45_000 });
    await page.getByRole("button", { name: "Está bom" }).click();
    // The server deals them their card: the family they were born into, and what they start with.
    const makuta = await turnCard(page);
    await page.waitForURL(/\/andar\?pack=l1/);
    // On the way in: megabytes of megabytes, never a bare spinner.
    await expect(page.locator(".arriving-count")).toContainText(/ de \d+,\d\sMB/);
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await expect(page.locator(".arriving")).toHaveCount(0);
    await expect(page.locator(".n-arrival, .n-wallet").first()).toBeVisible();
    // What the card said is what the wallet shows.
    await expect(page.locator(".n-wallet")).toContainText(makuta.replace(/\sMk$/, ""));
    // And the server knows them: a guest, of an age band and no more, with the look they chose and the card they were dealt.
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token?: string; ageBand?: string; origin?: { makuta: number; family: string } });
    expect(kept.ageBand).toBe("18_plus");
    const me = (await (await page.request.get("/api/v1/me", { headers: { authorization: `Bearer ${kept.token}` } })).json()) as { kind: string; ageBand: string; look: { sex: string } | null; origin: { makuta: number; family: string } | null };
    expect(me).toMatchObject({ kind: "guest", ageBand: "18_plus", look: { sex: "f" }, origin: kept.origin });
    expect(JSON.stringify(await page.evaluate(() => ({ ...localStorage })))).not.toContain("1990");

    // The light door: Modo Poupança is chosen for this device before the game opens.
    // And someone who has a look already goes straight in.
    await page.goto("/");
    await page.getByRole("link", { name: /Entrar em Modo Poupança/ }).click();
    await page.waitForURL(/\/andar\?pack=l1/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nzila.settings") ?? "{}").poupanca)).toBe(true);
    expect(seen.errors).toEqual([]);
  });

  test("once visited, the door opens with the network gone, and the game can be put on the phone's screen", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByRole("img", { name: "Nzila" })).toBeVisible();
    // Installable: a manifest with the game's name and its icons.
    const manifest = await (await page.request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ name: "Nzila", display: "standalone", start_url: "/" });
    for (const icon of manifest.icons as { src: string }[]) expect((await page.request.get(icon.src)).ok()).toBe(true);
    // The worker takes the page; a second visit fills what it keeps; then the network goes.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload({ waitUntil: "networkidle" });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("img", { name: "Nzila" })).toBeVisible();
    await expect(page.getByText("O teu caminho começa aqui.")).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe("the age question", () => {
  test("someone under 15 is turned away kindly, nothing of them is kept, and the door stays shut for the visit", async ({ page, request }, info) => {
    if (!(await request.get("/packs/front.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa is not built (it needs Blender). The age question was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    const asked: string[] = [];
    page.on("request", (sent) => void (sent.url().includes("/api/") && asked.push(sent.url())));
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar em Luanda" }).click();
    // A year that is no year is said to be wrong, and can be typed again.
    await bornIn(page, "1800");
    await expect(page.getByRole("alert")).toHaveText("Esse ano não está certo. Experimenta outra vez.");
    for (let n = 0; n < 4; n++) await page.getByRole("button", { name: "Apagar" }).click();
    await bornIn(page, String(new Date().getFullYear() - 12));
    await expect(page.getByRole("heading", { name: "Ainda não é a tua vez" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar" })).toHaveCount(0);
    // Nothing kept on the phone, nothing sent to the server.
    expect(await page.evaluate(() => localStorage.getItem("nzila.conta"))).toBeNull();
    expect(asked).toEqual([]);
    // Coming back to the door on the same visit does not ask again.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Ainda não é a tua vez" })).toBeVisible();
    await expectNoSidewaysScroll(page);
    expect(seen.errors).toEqual([]);
  });
});

test.describe("the BI", () => {
  test("shows who the server says they are, with the photograph from the look chooser; the name is asked about as it is typed, taken once, and kept", async ({ page, request }, info) => {
    if (!(await request.get("/packs/front.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa or the people are not built (they need Blender). The BI was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar em Luanda" }).click();
    await bornIn(page, "2009");
    await page.waitForFunction(() => window.__provador?.ready === true, undefined, { timeout: 45_000 });
    await page.getByRole("button", { name: "Está bom" }).click();
    await turnCard(page);
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });

    await page.getByRole("button", { name: "Telemóvel" }).click();
    await page.getByRole("button", { name: "BI", exact: true }).click();
    const card = page.locator(".n-bi");
    // They arrived with a name and a number of their own, a bairro from their card, today.
    await expect(card.locator(".n-bi-name")).toHaveText(/^Caluanda \d{4,}$/);
    await expect(card).toContainText(/\d{8}-LA/);
    await expect(card).toContainText(/\d{1,2} de \p{Lu}\p{L}+/u);
    await expect(card.locator("img.tm-bi-photo")).toBeVisible();
    expect(await card.locator("img.tm-bi-photo").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(144);

    await page.getByRole("button", { name: "Mudar o nome" }).click();
    const field = page.getByLabel("Como te chamas?");
    const said = page.locator(".tm-name-said");
    await field.fill("Zé");
    await expect(said).toHaveText("Muito curto: pelo menos 3 letras.");
    await field.fill("Admin Nzila");
    await expect(said).toHaveText("Esse nome não pode ser.");
    // One name a browser, so that the two of them do not ask for the same one.
    const name = `Kamba ${info.project.name}`;
    await field.fill(name);
    await expect(said).toHaveText("Está livre. É teu, se quiseres.");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(card.locator(".n-bi-name")).toHaveText(name);
    // The one free change is spent: the button is gone, here and after the page is opened again.
    await expect(page.getByRole("button", { name: "Mudar o nome" })).toHaveCount(0);
    await page.goto("/andar?pack=l1&telemovel=bi");
    await expect(page.locator(".n-bi-name")).toHaveText(name);
    await expect(page.getByRole("button", { name: "Mudar o nome" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "A minha família" })).toBeVisible();
    // The younger band is what the server kept of someone born in 2009.
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token?: string }).token);
    expect(await (await page.request.get("/api/v1/me", { headers: { authorization: `Bearer ${token}` } })).json()).toMatchObject({ name, nameFree: false, ageBand: "15_17" });
    await expectNoSidewaysScroll(page);
    expect(seen.errors).toEqual([]);
  });
});

test.describe("first play", () => {
  // Measured as a first visit is: nothing kept yet, every byte from the network and seen by the count.
  test.use({ serviceWorkers: "block" });

  test("first play, from the door to standing in the Marginal, costs under 6 MB and takes under a minute on a slow phone (Rule 2)", async ({ page, request }, info) => {
    if (!(await request.get("/packs/front.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa or the people are not built (they need Blender). First play was not measured here." });
      test.skip();
      return;
    }
    test.setTimeout(150_000);
    const slowed = await slowPhone(page);
    const seen = watch(page);
    const started = Date.now();
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar em Luanda" }).click();
    // First play is the whole of it: the door, the age question, choosing a look, and arriving.
    await bornIn(page, "1990");
    await page.waitForFunction(() => window.__provador?.ready === true, undefined, { timeout: 60_000 });
    await page.getByRole("button", { name: "Está bom" }).click();
    await turnCard(page);
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 120_000 });
    const seconds = (Date.now() - started) / 1000;
    const megabytes = seen.bytes() / 1_000_000;
    info.annotations.push({ type: "first play", description: `${megabytes.toFixed(2)} MB in ${seconds.toFixed(1)} s${slowed ? " on the slow profile" : " (this browser cannot be slowed: time not held to the budget)"}` });
    console.log(`first play [${info.project.name}]: ${megabytes.toFixed(2)} MB in ${seconds.toFixed(1)} s${slowed ? " on the slow profile" : ""}`);
    expect(megabytes).toBeLessThan(6);
    if (slowed) expect(seconds).toBeLessThan(60);
    expect(seen.errors).toEqual([]);
  });
});

test.describe("the styleguide", () => {
  test("every component draws, nothing scrolls sideways, nothing errors, and it looks as it did", async ({ page }, info) => {
    const seen = watch(page);
    await page.goto("/styleguide", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { name: "Styleguide" })).toBeVisible();
    // One of each kind of thing, by what a player would see or a screen reader would read.
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Modo Poupança" })).toBeVisible();
    expect(await page.locator(".n-route-van").count()).toBeGreaterThan(1);
    await expectNoSidewaysScroll(page);
    expect(seen.errors).toEqual([]);
    await expectLooksTheSame(page, info, "styleguide");
  });

  test("a press is answered: the switch turns, a fare leaves the wallet", async ({ page }) => {
    await page.goto("/styleguide", { waitUntil: "networkidle" });
    const poupanca = page.getByRole("switch", { name: "Modo Poupança" });
    await expect(poupanca).toHaveAttribute("aria-checked", "true");
    await poupanca.click();
    await expect(poupanca).toHaveAttribute("aria-checked", "false");

    const pay = page.locator(".sg-case", { hasText: "pay a fare" });
    await expect(pay.locator(".n-wallet")).toContainText("25.000");
    await pay.getByRole("button").click();
    await expect(pay.locator(".n-wallet")).toContainText("24.800");
  });
});

/** A graphics card that is really the processor pretending. Its frame rate says nothing about a phone. */
const SOFTWARE = /swiftshader|llvmpipe|software|basic render/i;

test.describe("the renderer", () => {
  test("draws the world at every tier and hour inside the drawing budgets, with nothing wrong", async ({ page }, info) => {
    const seen = watch(page);
    for (const view of ["hour=17.4&tier=poupanca", "hour=12&tier=normal", "hour=22&tier=alta"]) {
      await page.goto(`/cena?${view}&still`);
      // The district when it has been built, every chunk of it arrived; the test scene of boxes when not.
      // (Before either is there the page draws only the sky: two calls. Waiting for four is waiting for a world.)
      await page.waitForFunction(() => window.__cena !== undefined && window.__cena.draws >= 4 && (window.__cena.stream === undefined || (window.__cena.stream.shown === window.__cena.stream.wanted && window.__cena.stream.loading === 0)), undefined, { timeout: 30_000 });
      await page.waitForTimeout(400);
      const counts = await page.evaluate(() => window.__cena!);
      info.annotations.push({ type: "renderer", description: `${view}: ${counts.draws} draw calls, ${counts.triangles} triangles, ${counts.height} px tall, ${counts.graphics}` });
      // Rule 1. These are counted, not timed, so they hold on any machine.
      expect(counts.draws).toBeLessThanOrEqual(120);
      expect(counts.triangles).toBeLessThanOrEqual(120_000);
      // The sky, the bay and a chunk or more at the least.
      expect(counts.draws).toBeGreaterThanOrEqual(4);
      // Something is really on screen: a blank canvas compresses to almost nothing.
      const picture = await page.locator(".cena-canvas").screenshot();
      expect(picture.length).toBeGreaterThan(15_000);
    }
    await expectNoSidewaysScroll(page);
    expect(seen.errors).toEqual([]);
  });

  test("the hour can be dragged and the tier switched", async ({ page }) => {
    await page.goto("/cena?hour=12&still");
    await page.waitForFunction(() => window.__cena !== undefined);
    await expect(page.locator(".cena-clock")).toHaveText("12:00");
    await page.getByRole("slider", { name: "Hour of the day" }).fill("22");
    await expect(page.locator(".cena-clock")).toHaveText("22:00");
    const low = await page.evaluate(() => window.__cena!.draws);
    await page.getByRole("button", { name: "alta" }).click();
    await expect(page.getByRole("button", { name: "alta" })).toHaveAttribute("aria-pressed", "true");
    // Alta draws real shadows, which costs draw calls the lowest tier does not spend.
    await page.waitForFunction((before) => window.__cena!.draws > before, low);
  });
});

test.describe("the candongueiros", () => {
  test("run their linhas by the clock: one stands at each line's first paragem, then it has moved on", async ({ page, request }, info) => {
    if (!(await request.get("/packs/l1/manifest.json")).ok() || !(await request.get("/packs/dev-vehicles/veiculos.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa or the vehicles are not built (they need Blender). The traffic was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await page.goto("/cena?pack=l1&tier=poupanca&hour=12&transito=3&at=313,110.5,1.6&look=304,104.5,1");
    await page.waitForFunction(() => (window.__cena?.vans?.length ?? 0) > 0, undefined, { timeout: 45_000 });
    const standing = await page.evaluate(() => window.__cena!.vans!);
    expect(standing.filter((van) => van.dwelling).map((van) => van.route).sort()).toEqual(["linha-marginal", "linha-mutamba"]);
    const atStop = standing.find((van) => van.route === "linha-marginal" && van.dwelling)!;
    await page.evaluate(() => window.__cenaMoment!(22));
    await page.waitForFunction(() => window.__cena!.vans!.some((van) => van.route === "linha-marginal" && !van.dwelling), undefined, { timeout: 10_000 });
    const later = await page.evaluate(() => window.__cena!.vans!);
    // The other traffic goes round too: cars, motos and a kupapata, none where it was a moment ago.
    const cars = await page.evaluate(() => window.__cena!.cars!);
    expect(cars.map((car) => car.model.split("-")[0]).sort().filter((model, n, all) => all.indexOf(model) === n)).toEqual(["candongueiro", "carro", "kupapata", "mota"]);
    const first = (await page.evaluate(() => (window.__cenaMoment!(3), new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(window.__cena!.cars!))))))) as typeof cars;
    // (One of those that come down the viaduct may be waiting out of sight at either moment.)
    expect(first.filter((car, n) => Math.hypot(car.x - cars[n]!.x, car.z - cars[n]!.z) > 20).length >= first.length - 1).toBe(true);
    // Traffic keeps to the right: on the avenue's town side the van has gone east.
    expect(later.some((van) => van.route === "linha-marginal" && !van.dwelling && van.x > atStop.x + 20)).toBe(true);
    expect(seen.errors).toEqual([]);
  });
});

test.describe("a lost graphics context", () => {
  test("the browser takes the context away and gives it back: the world is drawn again, with nothing wrong", async ({ page, request }, info) => {
    if (!(await request.get("/packs/l1/manifest.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa is not built (it needs Blender). Recovery was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await page.goto("/cena?pack=l1&tier=normal&hour=12&transito=30&at=250,66,1.7&look=215,66,1.2");
    await page.waitForFunction(() => (window.__cena?.draws ?? 0) >= 4 && window.__cena!.stream !== undefined && window.__cena!.stream.shown === window.__cena!.stream.wanted && window.__cena!.stream.loading === 0, undefined, { timeout: 45_000 });
    const before = await page.evaluate(() => window.__cena!.triangles);
    const could = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas")!;
      const lose = (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))?.getExtension("WEBGL_lose_context");
      if (!lose) return false;
      lose.loseContext();
      await new Promise((done) => setTimeout(done, 400));
      lose.restoreContext();
      return true;
    });
    if (!could) {
      info.annotations.push({ type: "skipped", description: "This browser cannot be made to lose its context." });
      return;
    }
    await page.waitForFunction(() => window.__cena!.restored === 1, undefined, { timeout: 15_000 });
    // The same view again, give or take the people who walked on.
    await page.waitForFunction((was) => window.__cena!.triangles > was * 0.8, before, { timeout: 15_000 });
    expect(seen.errors.filter((line) => !/context lost|CONTEXT_LOST/i.test(line))).toEqual([]);
  });
});

test.describe("the look chooser", () => {
  test("a body, its skin, hair and its colour, and each piece of clothing are chosen, worn at once, kept, and worn in the world", async ({ page, request }, info) => {
    if (!(await request.get("/packs/guarda-roupa/guarda-roupa.json")).ok() || !(await request.get("/packs/l1/manifest.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The wardrobe or Marginal e Baixa is not built (they need Blender). The look chooser was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await page.goto("/provador?tier=poupanca");
    await page.waitForFunction(() => window.__provador?.ready === true, undefined, { timeout: 45_000 });
    const worn = (): Promise<{ look: { sex: string; hair: string; hairColour: string; top: string; bottom: string }; dressed: number }> => page.evaluate(() => window.__provador!);
    // She has a pano; he cannot: changing the body changes what no longer fits to the nearest thing that does.
    await page.getByRole("radio", { name: "Ele" }).click();
    await page.getByRole("radio", { name: "Galo" }).click();
    await page.getByRole("radiogroup", { name: "Cor do cabelo" }).getByRole("radio", { name: "Cor 4" }).click();
    await page.getByRole("radio", { name: "Calções" }).click();
    await page.waitForFunction(() => window.__provador!.look.hair === "galo" && window.__provador!.look.hairColour === "hairRed" && window.__provador!.look.bottom === "shorts", undefined, { timeout: 30_000 });
    expect(await worn()).toMatchObject({ look: { sex: "m", hair: "galo", hairColour: "hairRed", bottom: "shorts" } });
    expect((await worn()).dressed).toBeGreaterThan(1);
    // What is worn on the face, and how tall he is.
    await page.getByRole("switch", { name: "Óculos escuros" }).click();
    await page.getByRole("switch", { name: "Barba" }).click();
    await page.getByRole("radio", { name: "Alto" }).click();
    await page.waitForFunction(() => window.__provador!.look.extras?.length === 2 && window.__provador!.look.tall === 1, undefined, { timeout: 30_000 });
    await expect(page.getByRole("switch", { name: "Brincos" })).toHaveAttribute("aria-checked", "false");
    // Hers are not offered to him.
    await expect(page.getByRole("radio", { name: "Pano" })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Cachos" })).toHaveCount(0);
    await expectNoSidewaysScroll(page);

    await page.getByRole("button", { name: "Está bom" }).click();
    await page.waitForURL(/\/andar\?pack=l1/);
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nzila.look") ?? "{}"))).toMatchObject({ sex: "m", hair: "galo", hairColour: "hairRed" });
    expect(seen.errors).toEqual([]);
  });
});

test.describe("the Telemóvel", () => {
  test("opens over the world with its nine apps; the Mapa draws the district and marks a place for the compass; Definições change the hand and the picture and are remembered", async ({ page, request }, info) => {
    if (!(await request.get("/packs/l1/manifest.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa or the people are not built (they need Blender). The Telemóvel was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await page.goto("/andar?pack=l1&em=250,68&hour=12&transito=30");
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await page.getByRole("button", { name: "Telemóvel" }).click();
    const phone = page.getByRole("dialog", { name: "Telemóvel" });
    await expect(phone.locator(".n-phone-icon")).toHaveCount(9);

    // An app that is not here yet says so, and says what to do meanwhile.
    await phone.getByRole("button", { name: "Garagem" }).click();
    await expect(phone).toContainText("Em breve");
    await expect(phone).toContainText("anda de candongueiro");
    await phone.getByRole("button", { name: "Voltar" }).click();

    // The Mapa: the district's name, its picture, and a place chosen by touching it.
    await phone.getByRole("button", { name: "Mapa" }).click();
    await expect(phone).toContainText("Marginal e Baixa");
    const map = phone.locator(".tm-map-canvas");
    await expect.poll(() => map.evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(400);
    // The Marginal paragem is at (300, 109.7) of a district 448 m by 256 m.
    const box = (await map.boundingBox())!;
    await map.click({ position: { x: (300 / 448) * box.width, y: (109.7 / 256) * box.height } });
    await expect(phone.locator(".tm-place")).toContainText("Marginal");
    await phone.getByRole("button", { name: "Marcar" }).click();
    await expect(phone.getByRole("button", { name: "Desmarcar" })).toBeVisible();
    await expect(page.locator(".n-compass-target")).toHaveCount(1);
    await phone.getByRole("button", { name: "Voltar" }).click();

    // Definições: the hand changes the page at once, Modo Poupança the picture; both are still chosen after a reload.
    await phone.getByRole("button", { name: "Definições" }).click();
    await phone.getByRole("radio", { name: "Esquerda" }).click();
    await expect(page.locator("main.andar-left")).toHaveCount(1);
    await phone.getByRole("switch", { name: "Modo Poupança" }).click();
    await expect(phone.getByRole("radio", { name: "Poupança" })).toHaveAttribute("aria-checked", "true");
    await expect(phone).toContainText("nesta sessão");
    await phone.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByRole("dialog", { name: "Telemóvel" })).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await page.reload();
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await expect(page.locator("main.andar-left")).toHaveCount(1);
    expect(seen.errors).toEqual([]);
  });
});

test.describe("a ride", () => {
  test("a van standing at the paragem is boarded, ridden to the next paragem and left there, on the pavement", async ({ page, request }, info) => {
    if (!(await request.get("/packs/l1/manifest.json")).ok() || !(await request.get("/packs/dev-vehicles/veiculos.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa, the vehicles or the people are not built (they need Blender). The ride was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(120_000);
    const seen = watch(page);
    // The timetable runs from its beginning, where a van stands at the Marginal paragem; the page boards by itself.
    await page.goto("/andar?pack=l1&em=302.5,107.4&tier=poupanca&hour=12&desde=0&apanhar");
    await page.waitForFunction(() => window.__andar?.riding === "linha-marginal", undefined, { timeout: 45_000 });
    // Standing at the Marginal paragem the band says where, as it is said (founder, 2026-11-15).
    await expect(page.locator(".n-route")).toContainText("Estamos na Marginal");
    await page.waitForFunction(() => window.__andar!.riding === null && window.__andar!.action === "board", undefined, { timeout: 60_000 });
    const after = await page.evaluate(() => window.__andar!);
    // Porto is a hundred metres east; she is beside the van, not in the road it stands on.
    expect(after.x).toBeGreaterThan(395);
    expect(after.action).toBe("board");
    await expect(page.locator(".n-route")).toHaveCount(0);
    expect(seen.errors).toEqual([]);
  });
});

test.describe("the people of the street", () => {
  test("keep their timetables: one man fishes off the Marginal until the officer comes, then he runs; and the picture stays inside its budget", async ({ page, request }, info) => {
    if (!(await request.get("/packs/l1/manifest.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa or the people are not built (they need Blender). The street's people were not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await page.goto("/cena?pack=l1&tier=normal&hour=12&transito=30&at=367.5,53.5,1.6&look=362,48.8,1.1");
    await page.waitForFunction(() => (window.__cena?.people?.length ?? 0) > 0 && window.__cena!.stream !== undefined && window.__cena!.stream.shown === window.__cena!.stream.wanted && window.__cena!.stream.loading === 0, undefined, { timeout: 45_000 });
    const quiet = await page.evaluate(() => window.__cena!);
    expect(quiet.people!.find((p) => p.role === "pescador")).toMatchObject({ pose: "fish", speed: 0 });
    // Eighteen people at most at Normal (six in their whole body), and the whole picture inside the reference budget.
    expect(quiet.people!.length).toBeLessThanOrEqual(18);
    expect(quiet.triangles).toBeLessThan(120_000);
    await page.evaluate(() => window.__cenaMoment!(96));
    await page.waitForFunction(() => window.__cena!.people!.some((p) => p.role === "pescador" && p.speed > 0), undefined, { timeout: 10_000 });
    const chase = await page.evaluate(() => window.__cena!);
    const fisher = chase.people!.find((p) => p.role === "pescador")!;
    const officer = chase.people!.find((p) => p.role === "policia")!;
    // He runs west along the walk first, and the officer is behind him and slower (founder, 2026-11-15).
    expect(fisher.speed).toBeGreaterThan(3.5);
    expect(fisher.x).toBeLessThan(362);
    expect(officer.speed).toBeLessThan(fisher.speed);
    expect(officer.x).toBeGreaterThan(fisher.x);
    expect(seen.errors).toEqual([]);
  });
});

test.describe("a person", () => {
  test("walks the district by the simulation's rules: the body moves over the ground, and nothing errors", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Walking was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await page.goto("/andar?auto&tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    const start = await page.evaluate(() => window.__andar!.x);
    // The scripted turn begins by walking east at a metre and a half a second.
    await page.waitForFunction((from) => window.__andar!.x > from + 2, start, { timeout: 20_000 });
    // Every foot that came down asked for its sound.
    expect(await page.evaluate(() => window.__andar!.sounds)).toBeGreaterThan(2);
    const moving = await page.evaluate(() => window.__andar!);
    info.annotations.push({ type: "walk", description: `from x ${start.toFixed(1)} to ${moving.x.toFixed(1)} m, at ${moving.speed.toFixed(2)} m/s` });
    expect(moving.speed).toBeGreaterThan(0.8);
    expect(moving.speed).toBeLessThan(4.6);
    await expectNoSidewaysScroll(page);
    expect(seen.errors).toEqual([]);
  });
});

test.describe("the first walk's HUD", () => {
  test("shows the wallet, the compass, the clock and the buttons; a gesture is made, a bench is sat on and left", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). The HUD was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await page.goto("/andar?tier=poupanca&hour=12&sentar");
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await expect(page.locator(".n-wallet")).toContainText("Mk");
    await expect(page.getByRole("button", { name: "Bússola" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Telemóvel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Correr" })).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Correr" }).click();
    await expect(page.getByRole("button", { name: "Correr" })).toHaveAttribute("aria-pressed", "true");

    // Seated on the nearest bench: the gold button offers to get up, and does.
    await page.waitForFunction(() => window.__andar!.seated, undefined, { timeout: 15_000 });
    await page.getByRole("button", { name: "Levantar" }).click();
    await page.waitForFunction(() => !window.__andar!.seated && window.__andar!.action !== "stand", undefined, { timeout: 15_000 });

    // A jump: the feet leave the ground and come back to it.
    await page.getByRole("button", { name: "Saltar" }).click();
    await page.waitForFunction(() => window.__andar!.lift > 0.2, undefined, { timeout: 5_000 });
    await page.waitForFunction(() => window.__andar!.lift === 0 && window.__andar!.jumps === 1, undefined, { timeout: 5_000 });

    // A gesture from the wheel.
    await page.getByRole("button", { name: "Gestos" }).click();
    await page.getByRole("menuitem", { name: "Acenar" }).click();
    await page.waitForFunction(() => window.__andar!.emote === "acenar", undefined, { timeout: 5_000 });
    await page.waitForFunction(() => window.__andar!.emote === null, undefined, { timeout: 10_000 });
    await expectNoSidewaysScroll(page);
    expect(seen.errors).toEqual([]);
  });
});

test.describe("the bench", () => {
  // A frame rate is a measurement, and the machine running the tests is doing other things
  // too. The budget is judged on the best of three runs: a slow machine can fail a fast page
  // once, but a page that is really too slow fails all three.
  test.describe.configure({ retries: 2 });

  test("runs the renderer along its fixed path inside the drawing budgets, and holds 30 frames a second where that can be judged", async ({ page }, info) => {
    const slowed = await slowPhone(page);
    const seen = watch(page);
    await page.goto("/bench?auto&seconds=5");
    await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 60_000 });
    const result = await page.evaluate(() => window.__bench!);
    const software = SOFTWARE.test(result.graphics ?? "");

    info.annotations.push({
      type: "bench",
      description: `sustained ${result.fpsSustained.toFixed(1)} fps, average ${result.fps.toFixed(1)}, worst 1% ${result.fpsLow.toFixed(1)}, ${result.draws} draw calls, ${result.triangles} triangles, drawn ${result.drawnHeight} px tall, sim step ${result.simStepMs.toFixed(2)} ms${slowed ? ", processor slowed 4x" : ""}, ${result.graphics}${software ? " (software: frame rate not judged)" : ""} (${result.scene})`,
    });
    expect(result.standIn).toBe(false);
    expect(result.frames).toBeGreaterThan(20);
    expect(result.draws).toBeLessThanOrEqual(120);
    expect(result.triangles).toBeLessThanOrEqual(120_000);
    // The frame budget is judged only where the number means something: on the phone profile,
    // and only when the browser has a real graphics card to draw with. Playwright's WebKit, and
    // any browser on a machine without one (CI), draw with the processor; there the bench must
    // run cleanly and its frame rate is recorded, not judged. Real phones are measured by hand
    // on this same page (Task 1.9).
    if (slowed && !software) expect(result.fpsSustained).toBeGreaterThanOrEqual(FPS_BUDGET);
    // A step of the simulation must leave most of its 50 ms for everything else.
    expect(result.simStepMs).toBeLessThan(25);
    expect(seen.errors).toEqual([]);
    await expect(page.getByText("The budget is 30.", { exact: false })).toBeVisible();
  });

  test("the flat stand-in scene still runs, to tell a slow phone from a slow renderer", async ({ page }) => {
    await page.goto("/bench?auto&seconds=2&scene=2d");
    await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 60_000 });
    const result = await page.evaluate(() => window.__bench!);
    expect(result.standIn).toBe(true);
    expect(result.draws).toBeUndefined();
  });
});
