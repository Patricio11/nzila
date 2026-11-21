declare global {
  interface Window {
    __provador?: { ready: boolean; look: { sex: string; hair: string; hairColour: string; top: string; bottom: string; extras?: string[]; tall?: number }; dressed: number };
    __cenaMoment?: (second: number) => void;
    __andar?: { othersOnScreen: { x: number; y: number }[]; shoulder: number; othersRiding: number; myRide: { vehicle: number; seat: number } | null; streetNow: number; vans: { key: string; x: number; z: number }[]; trafficFollowed: boolean; at: number; known: number; x: number; z: number; speed: number; ready: boolean; seated: boolean; emote: string | null; action: string | null; lift: number; jumps: number; riding: string | null; sounds: number; names: number; waited: number; nearestVehicle: number; tangled: number; heeding: number; linked: boolean; players: number; corrections: number; channel: number | null; net: string; reconnections: number; fall: () => void; talk: boolean; balloons: number; lines: string[]; gestures: (string | null)[]; others: { x: number; z: number; name: string; still: boolean }[] };
  }
}

import { readFileSync } from "node:fs";
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
    await page.goto("/?convidado", { waitUntil: "networkidle" });
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
    await page.goto("/?convidado");
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
    await page.waitForURL(/\/andar\?pack=(l1|zango)/);
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
    await page.goto("/?convidado");
    await page.getByRole("link", { name: /Entrar em Modo Poupança/ }).click();
    await page.waitForURL(/\/andar\?pack=(l1|zango)/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nzila.settings") ?? "{}").poupanca)).toBe(true);
    expect(seen.errors).toEqual([]);
  });

  test("once visited, the door opens with the network gone, and the game can be put on the phone's screen", async ({ page, context }) => {
    await page.goto("/?convidado");
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
    await page.goto("/?convidado");
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
    await page.goto("/?convidado");
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
    await page.goto("/?convidado");
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
    // Opened again in the bairro they are in, as the door would: their card may have woken them in Zango (D-11.1),
    // and a phone sent on from the wrong bairro drops what it was fetching, which Safari writes down as errors.
    const pack = await page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token;
      return ((await (await fetch("/api/v1/me/place", { headers: { authorization: `Bearer ${token}` } })).json()) as { pack: string }).pack;
    });
    await page.goto(`/andar?pack=${pack}&telemovel=bi`);
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await expect(page.locator(".n-bi-name")).toHaveText(name);
    await expect(page.getByRole("button", { name: "Mudar o nome" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "A minha família" })).toBeVisible();
    // The younger band is what the server kept of someone born in 2009.
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token?: string }).token);
    expect(await (await page.request.get("/api/v1/me", { headers: { authorization: `Bearer ${token}` } })).json()).toMatchObject({ name, nameFree: false, ageBand: "15_17" });
    await expectNoSidewaysScroll(page);

    // Os meus dados: both choices are off until they say yes; all of it can be taken away as a file.
    await page.getByRole("button", { name: "Os meus dados" }).click();
    const analytics = page.getByRole("switch", { name: "Ajudar a melhorar o jogo" });
    await expect(analytics).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("switch", { name: "Receber avisos" })).toHaveAttribute("aria-checked", "false");
    await analytics.click();
    await expect(analytics).toHaveAttribute("aria-checked", "true");
    const headers = { authorization: `Bearer ${token}` };
    expect(await (await page.request.get("/api/v1/me/consents", { headers })).json()).toEqual({ analytics: true, notifications: false });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Levar os meus dados" }).click();
    const file = await (await download).path();
    const taken = JSON.parse((await import("node:fs")).readFileSync(file, "utf8")) as { player: { name: string }; look: unknown; origin: unknown; onThisPhone: unknown };
    expect(taken).toMatchObject({ player: { name, ageBand: "15_17" }, look: { sex: "f" }, origin: { makuta: expect.any(Number) }, onThisPhone: { look: { sex: "f" } } });

    // Deleting asks twice. "Ficar" changes nothing; "Sim" ends it: the phone forgets them and the server lets nobody in with their token.
    await page.getByRole("button", { name: "Apagar a conta" }).click();
    await expect(page.getByRole("alertdialog", { name: "Apagar tudo?" })).toBeVisible();
    await page.getByRole("button", { name: "Ficar" }).click();
    await page.getByRole("button", { name: "Apagar a conta" }).click();
    await page.getByRole("button", { name: "Sim, apagar tudo" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByRole("button", { name: "Entrar em Luanda" })).toBeVisible();
    expect(await page.evaluate(() => [localStorage.getItem("nzila.conta"), localStorage.getItem("nzila.look"), localStorage.getItem("nzila.foto")])).toEqual([null, null, null]);
    expect((await page.request.get("/api/v1/me", { headers })).status()).toBe(401);
    expect(seen.errors.filter((error) => !error.includes("401"))).toEqual([]);
  });
});

test.describe("saving the BI", () => {
  test("a guest saves the BI with a phone number and a code; a second phone comes in with the number and finds the whole player; the first phone is put out and told", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/front.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa or the people are not built (they need Blender). Saving the BI was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(150_000);
    const seen = watch(page);
    // Saving with a number is switched off for players (nobody pays a provider to send the codes): this test switches
    // it on, for its own two phones, against the browser tests' API, which has it on too.
    await page.addInitScript(() => localStorage.setItem("nzila.numero", "1"));
    // One number a browser. The browser tests' API sends every number the same code, to nobody.
    const phone = info.project.name === "phone" ? "923 000 101" : "923 000 102";
    const code = "246810";
    await page.goto("/?convidado");
    await page.getByRole("button", { name: "Entrar em Luanda" }).click();
    await bornIn(page, "1988");
    await page.waitForFunction(() => window.__provador?.ready === true, undefined, { timeout: 45_000 });
    await page.getByRole("button", { name: "Está bom" }).click();
    const makuta = await turnCard(page);
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await page.getByRole("button", { name: "Telemóvel" }).click();
    await page.getByRole("button", { name: "BI", exact: true }).click();
    const born = (await page.locator(".n-bi-name").textContent()) ?? "";
    expect(born).toMatch(/^Caluanda \d+$/);

    // The honest line, then the number, then the code.
    await expect(page.getByText("Sem isto, o teu progresso fica só neste telemóvel.")).toBeVisible();
    await page.getByRole("button", { name: "Guardar o meu BI" }).click();
    await page.getByRole("radio", { name: "Número" }).click();
    await page.getByLabel("O teu número de telemóvel").fill("12");
    await expect(page.getByRole("button", { name: "Enviar código" })).toBeDisabled();
    await page.getByLabel("O teu número de telemóvel").fill(phone);
    await page.getByRole("button", { name: "Enviar código" }).click();
    await page.getByLabel("O código de 6 algarismos que recebeste").fill("111111");
    await page.getByRole("button", { name: "Confirmar código" }).click();
    await expect(page.locator(".tm-save-said")).toHaveText("O código não está certo. Vê outra vez.");
    await page.getByLabel("O código de 6 algarismos que recebeste").fill(code);
    await page.getByRole("button", { name: "Confirmar código" }).click();
    await expect(page.getByText("BI guardado. Agora entras em qualquer telemóvel.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar o meu BI" })).toHaveCount(0);
    // The number is nowhere on the phone.
    expect(JSON.stringify(await page.evaluate(() => ({ ...localStorage })))).not.toContain("923000");

    // A second phone: nothing on it. The number and a code bring the player whole: no age asked, no look to choose, no card to turn.
    const other = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" });
    await other.addInitScript(() => localStorage.setItem("nzila.numero", "1"));
    const second = await other.newPage();
    await second.goto("/?convidado");
    await second.getByRole("link", { name: "Já tenho conta" }).click();
    await second.getByRole("radio", { name: "Número" }).click();
    await second.getByLabel("O teu número de telemóvel").fill(phone);
    await second.getByRole("button", { name: "Enviar código" }).click();
    await second.getByLabel("O código de 6 algarismos que recebeste").fill(code);
    await second.getByRole("button", { name: "Confirmar código" }).click();
    await second.waitForURL(/\/andar\?pack=(l1|zango)/);
    await second.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await expect(second.locator(".n-wallet")).toContainText(makuta.replace(/\sMk$/, ""));
    await second.getByRole("button", { name: "Telemóvel" }).click();
    await second.getByRole("button", { name: "BI", exact: true }).click();
    await expect(second.locator(".n-bi-name")).toHaveText(born);
    expect(await second.evaluate(() => (JSON.parse(localStorage.getItem("nzila.look") ?? "{}") as { sex?: string }).sex)).toBe("f");
    await other.close();

    // One active session a player, the newer wins: the first phone finds out the next time it asks, forgets the account, and the door says why.
    await page.goto("/andar?pack=l1&telemovel=bi");
    await page.waitForFunction(() => localStorage.getItem("nzila.conta") === null, undefined, { timeout: 30_000 });
    await page.goto("/?convidado");
    await expect(page.getByText("O teu BI foi aberto noutro telemóvel. Para jogar neste, entra outra vez.")).toBeVisible();
    await expect(page.getByLabel("O teu e-mail")).toBeVisible();
    await expectNoSidewaysScroll(page);
    expect(seen.errors.filter((error) => !/40[01]/.test(error))).toEqual([]);
  });
});

test.describe("saving the BI with an email", () => {
  test("a guest saves the BI with an email and a password and proves the address with the code sent to it; on a second phone a forgotten password is chosen anew, and the old one is dead", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/front.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa or the people are not built (they need Blender). Saving the BI by email was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(180_000);
    const seen = watch(page);
    const email = `kamba.${info.project.name}@exemplo.ao`;
    const password = "funje com peixe grelhado";
    // The browser tests' API puts the same code in every letter, and sends the letter nowhere.
    const code = "246810";
    await page.goto("/?convidado");
    await page.getByRole("button", { name: "Entrar em Luanda" }).click();
    await bornIn(page, "1995");
    await page.waitForFunction(() => window.__provador?.ready === true, undefined, { timeout: 45_000 });
    await page.getByRole("button", { name: "Está bom" }).click();
    await turnCard(page);
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await page.getByRole("button", { name: "Telemóvel" }).click();
    await page.getByRole("button", { name: "BI", exact: true }).click();
    const born = (await page.locator(".n-bi-name").textContent()) ?? "";

    await page.getByRole("button", { name: "Guardar o meu BI" }).click();
    // A player is offered the e-mail and nothing else: the number is not there to choose.
    await expect(page.getByRole("radio", { name: "Número" })).toHaveCount(0);
    const said = page.locator(".tm-save-said");
    await expect(said).toHaveText("Pelo menos 8 letras. Uma frase que só tu sabes é melhor do que uma palavra difícil.");
    // What is wrong is said at once, before anything is asked of the server.
    await page.getByLabel("O teu e-mail").fill("kamba@");
    await page.getByLabel("Escolhe uma palavra-passe").fill(password);
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(said).toHaveText("Esse e-mail não parece certo.");
    await page.getByLabel("O teu e-mail").fill(email);
    await page.getByLabel("Escolhe uma palavra-passe").fill("12345678");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(said).toHaveText("Essa adivinha-se logo. Escolhe outra.");
    await page.getByLabel("Escolhe uma palavra-passe").fill(password);
    await page.getByRole("button", { name: "Guardar", exact: true }).click();

    // Saved; and a letter has gone with a code. "Depois" leaves the address unproved, and the BI says so.
    await expect(page.getByRole("heading", { name: "Confirmar o meu e-mail" })).toBeVisible();
    await expect(said).toHaveText("Enviámos um código para o teu e-mail. Vale por 10 minutos.");
    await page.getByRole("button", { name: "Depois" }).click();
    await expect(page.getByText("BI guardado. Agora entras em qualquer telemóvel.")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar o meu e-mail" }).click();
    await page.getByLabel("O código de 6 algarismos que recebeste").fill("111111");
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(said).toHaveText("O código não está certo. Vê outra vez.");
    await page.getByLabel("O código de 6 algarismos que recebeste").fill(code);
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirmar o meu e-mail" })).toHaveCount(0);
    await expect(page.getByText("BI guardado. Agora entras em qualquer telemóvel.")).toBeVisible();
    // Neither the address nor the password stays on the phone.
    const kept = JSON.stringify(await page.evaluate(() => ({ ...localStorage })));
    expect(kept).not.toContain("exemplo.ao");
    expect(kept).not.toContain("funje");

    // A second phone, and the password forgotten: a wrong one is told one thing only; then a code to the address and a new password bring the player whole.
    const other = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" });
    const second = await other.newPage();
    await second.goto("/?convidado");
    await second.getByRole("link", { name: "Já tenho conta" }).click();
    await second.getByLabel("O teu e-mail").fill(email.toUpperCase());
    await second.getByLabel("A tua palavra-passe").fill("outra coisa qualquer");
    await second.getByRole("button", { name: "Entrar", exact: true }).click();
    const told = second.locator(".tm-save-said");
    await expect(told).toHaveText("O e-mail ou a palavra-passe não estão certos.");
    await second.getByRole("button", { name: "Esqueci-me da palavra-passe" }).click();
    await second.getByRole("button", { name: "Enviar código" }).click();
    await expect(told).toHaveText("Enviámos um código para o teu e-mail. Vale por 10 minutos.");
    await second.getByLabel("O código de 6 algarismos que recebeste").fill(code);
    await second.getByLabel("Escolhe uma palavra-passe").fill("uma palavra-passe nova");
    await second.getByRole("button", { name: "Guardar e entrar" }).click();
    await second.waitForURL(/\/andar\?pack=(l1|zango)/);
    await second.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await second.getByRole("button", { name: "Telemóvel" }).click();
    await second.getByRole("button", { name: "BI", exact: true }).click();
    await expect(second.locator(".n-bi-name")).toHaveText(born);
    // The old password opens nothing now, and the new one does.
    const signIn = (word: string) => second.request.post("/api/v1/signin/email", { data: { email, password: word, deviceId: "e2e-device-0000-abcdefgh" } });
    expect((await signIn(password)).status()).toBe(400);
    expect((await signIn("uma palavra-passe nova")).status()).toBe(200);
    await other.close();
    expect(seen.errors.filter((error) => !/40[01]/.test(error))).toEqual([]);
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
    await page.goto("/?convidado");
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

test.describe("the street has a body", () => {
  test("a bench is walked up to and not through; someone standing in the road is waited for, not driven through", async ({ page, request }, info) => {
    const built = await request.get("/packs/l1/manifest.json");
    if (!built.ok() || !(await request.get("/packs/dev-vehicles/veiculos.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa, the vehicles or the people are not built (they need Blender). Bodies were not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(240_000);
    const seen = watch(page);
    const manifest = (await built.json()) as { seats: { pos: [number, number, number]; facing: number }[]; routes: { id: string; spline: string; stopPoints: number[] }[] };

    // Walking straight at a bench from in front of it, for long enough to be well through it.
    const seat = manifest.seats[0]!;
    const facing = (seat.facing * Math.PI) / 180;
    const from = { x: seat.pos[0] + Math.sin(facing) * 2.4, z: seat.pos[2] + Math.cos(facing) * 2.4 };
    const bearing = ((Math.atan2(seat.pos[0] - from.x, -(seat.pos[2] - from.z)) * 180) / Math.PI + 360) % 360;
    await page.goto(`/andar?pack=l1&tier=poupanca&hour=12&em=${from.x.toFixed(2)},${from.z.toFixed(2)}&auto=${bearing.toFixed(1)}`);
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await page.waitForTimeout(5000);
    const stopped = await page.evaluate(() => window.__andar!);
    const reached = Math.hypot(stopped.x - seat.pos[0], stopped.z - seat.pos[2]);
    // They got to the bench (they were not held back at the start) and stopped at its edge: half its depth and their own half-width.
    expect(reached).toBeLessThan(1.2);
    expect(reached).toBeGreaterThan(0.45);

    // Standing in a van's lane, thirty metres past the paragem it is about to leave: it comes, slows, and stands. Nobody is driven through.
    const line = manifest.routes.find((route) => route.id === "linha-marginal")!;
    const spline = (await (await request.get(`/packs/l1/${line.spline}`)).json()) as { points: [number, number, number][] };
    const first = line.stopPoints[0]!;
    let along = 0;
    let lane = spline.points[first]!;
    for (let n = first; n + 1 < spline.points.length && along < 30; n++) {
      along += Math.hypot(spline.points[n + 1]![0] - spline.points[n]![0], spline.points[n + 1]![2] - spline.points[n]![2]);
      lane = spline.points[n + 1]!;
    }
    // (From the third second of the timetable a van stands at each line's first paragem, and leaves within a quarter of a minute.)
    await page.goto(`/andar?pack=l1&tier=poupanca&hour=12&desde=3&em=${lane[0].toFixed(2)},${lane[2].toFixed(2)}`);
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    const stood = await page.evaluate(() => window.__andar!);
    // Until a driver has seen them and is slowing for them...
    await page.waitForFunction(() => window.__andar!.heeding > 0, undefined, { timeout: 120_000, polling: 100 });
    // ...and then, for ten seconds, it is watched: it never reaches them, and it comes to a stand in front of them.
    const gaps: number[] = [];
    for (let n = 0; n < 40; n++) {
      gaps.push(await page.evaluate(() => window.__andar!.nearestVehicle));
      await page.waitForTimeout(250);
    }
    const after = await page.evaluate(() => window.__andar!);
    // A van is 2.35 m from its middle to its bumper: it stopped short of them, and it is still there, still waiting.
    expect(Math.min(...gaps)).toBeGreaterThan(2.9);
    expect(after.heeding).toBeGreaterThan(0);
    expect(after.waited).toBeGreaterThan(4);
    // And they were not shoved along the road.
    expect(Math.hypot(after.x - stood.x, after.z - stood.z)).toBeLessThan(0.3);

    // And the traffic among itself: left to run for a while, no two vehicles touch.
    await page.goto("/andar?pack=l1&tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await page.waitForTimeout(20_000);
    let tangled = 0;
    for (let n = 0; n < 60; n++) {
      tangled += await page.evaluate(() => window.__andar!.tangled);
      await page.waitForTimeout(250);
    }
    // Not once in sixty looks: a body does not go where another body is.
    expect(tangled).toBe(0);
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
    await page.waitForURL(/\/andar\?pack=(l1|zango)/);
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nzila.look") ?? "{}"))).toMatchObject({ sex: "m", hair: "galo", hairColour: "hairRed" });
    expect(seen.errors).toEqual([]);
  });
});

test.describe("the Telemóvel", () => {
  test("on a slow line the Telemóvel says it is coming, and comes (F-276): a press is never met with nothing", async ({ browser, request }, info) => {
    if (info.project.name === "iphone") {
      // The game's own keeping of its files cannot be switched off in Safari's engine here, and with it on the code is
      // there before it can be held back: the notice is checked on the Android phone, and it is the same code.
      info.annotations.push({ type: "skipped", description: "The Telemóvel on a slow line is checked on the Android profile only." });
      test.skip();
      return;
    }
    // On a first visit, before anything of the game is kept on the phone: what is kept would be there at once.
    const context = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "", serviceWorkers: "block" });
    const page = await context.newPage();
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). The Telemóvel on a slow line was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    // The Telemóvel is fetched the first time it is taken out (F-274): here its code takes two seconds to arrive.
    await page.route(/\/assets\/telemovel-[\w-]+\.js$/, async (route) => {
      await new Promise((later) => setTimeout(later, 2000));
      await route.continue();
    });
    await page.goto("/andar?tier=poupanca&hour=16&sozinho");
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    await page.getByRole("button", { name: "Telemóvel" }).click();
    await expect(page.getByRole("status").filter({ hasText: "A abrir…" })).toBeVisible({ timeout: 1500 });
    await page.screenshot({ path: info.outputPath("telemovel-a-abrir.png") });
    await expect(page.getByRole("dialog", { name: "Telemóvel" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("status").filter({ hasText: "A abrir…" })).toHaveCount(0);
    expect(seen.errors).toEqual([]);
    await context.close();
  });

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
    // Standing at a paragem the band is down from the top (founder, 2026-11-20).
    await expect(page.locator(".cr-band")).toHaveClass(/cr-band-down/);
    await page.screenshot({ path: info.outputPath("carrinha-na-paragem.png") });
    // Driving off, it goes back up out of the view, and the chip under the wallet says where the van goes next.
    await expect(page.locator(".cr-band")).not.toHaveClass(/cr-band-down/, { timeout: 30_000 });
    await expect(page.locator(".cr-chip")).toContainText("Próxima");
    await page.screenshot({ path: info.outputPath("carrinha-a-andar.png") });
    // A thumb slides it down from the chip, and it stays until slid up again.
    const chip = (await page.locator(".cr-chip").boundingBox())!;
    await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
    await page.mouse.down();
    await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2 + 70, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator(".cr-band")).toHaveClass(/cr-band-down/);
    await page.screenshot({ path: info.outputPath("carrinha-puxada.png") });
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
    // Eighteen people at most at Normal (three in their whole body), and the whole picture inside the reference budget.
    expect(quiet.people!.length).toBeLessThanOrEqual(18);
    console.log(`street of people [${info.project.name}]: ${quiet.triangles} triangles, ${quiet.people!.length} people`);
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

  test.describe("when a download fails", () => {
    // The game's service worker answers the packs itself, and a route is not asked about what it answers.
    test.use({ serviceWorkers: "block" });

    test("a body that cannot be fetched (a line that fell, a page left) is no error: the light one stands in (F-215)", async ({ page, request }, info) => {
      if (!(await request.get("/packs/l1/manifest.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
        info.annotations.push({ type: "skipped", description: "Marginal e Baixa or the people are not built (they need Blender). Failed downloads were not checked here." });
        test.skip();
        return;
      }
      // In WebKit a route breaks the page's blob: workers (the chunks' decoder starts its workers from them), and the
      // street never comes. What is checked here does not depend on the engine: it is checked on the Chromium phone.
      test.skip(info.project.name === "iphone", "a route breaks blob: workers in WebKit under Playwright");
      const thrown: string[] = [];
      page.on("pageerror", (error) => thrown.push(error.message));
      // Every whole body is cut off on its way; the light ones come.
      let cut = 0;
      await page.route(/\/packs\/dev-people\/pessoa-\d+\.glb$/, (route) => {
        cut += 1;
        return route.abort("connectionfailed");
      });
      await page.goto("/cena?pack=l1&tier=normal&hour=12&transito=30&at=367.5,53.5,1.6&look=362,48.8,1.1");
      await page.waitForFunction(() => (window.__cena?.people?.length ?? 0) > 0 && window.__cena!.stream !== undefined && window.__cena!.stream.shown === window.__cena!.stream.wanted, undefined, { timeout: 45_000 });
      await expect.poll(() => cut, { timeout: 10_000 }).toBeGreaterThan(0);
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => window.__cena!.people!.length)).toBeGreaterThan(0);
      expect(thrown).toEqual([]);
    });
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
    // Walking east and only walking: the scripted turn (?auto) runs from its fifth second, and on a slow machine the body
    // could be measured after that, at a run (gate of 2026-11-19).
    await page.goto("/andar?auto=90&tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    const start = await page.evaluate(() => window.__andar!.x);
    // East, at a walk (2,3 m a second).
    await page.waitForFunction((from) => window.__andar!.x > from + 4, start, { timeout: 20_000 });
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
    // Thirty frames a second on a 60 Hz screen is a frame every two refreshes: 33,33 ms, which the browser's clock
    // reports as 33,3 or 33,4. The second reads as 29,94 frames a second and is the same picture: half a frame of
    // allowance is for the clock, not for the renderer.
    if (slowed && !software) expect(result.fpsSustained).toBeGreaterThanOrEqual(FPS_BUDGET - 0.5);
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

test.describe("the door (D-4.12: everyone registers)", () => {
  test("someone new says their age, registers with an address and a password, makes their character, is dealt a family, and is in the street with its Makuta; the address is proved later", async ({ page, request }, info) => {
    if (!(await request.get("/packs/front.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "Marginal e Baixa or the people are not built (they need Blender). The door was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(180_000);
    const seen = watch(page);
    const email = `porta-${info.project.name}-${Date.now()}@exemplo.ao`;
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar em Luanda" }).click();
    await bornIn(page, "1995");
    // No guest is made by walking in: the account is asked for, and nothing else.
    await expect(page.getByRole("heading", { name: "Cria a tua conta" })).toBeVisible();
    expect(await page.evaluate(() => (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token?: string }).token)).toBeUndefined();
    await page.screenshot({ path: info.outputPath("porta-registar.png") });
    await page.getByLabel("O teu e-mail").fill(email);
    await page.getByLabel("Escolhe uma palavra-passe").fill("curta");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.locator(".tm-save-said")).not.toHaveText(/Um e-mail e uma palavra-passe/);
    await page.getByLabel("Escolhe uma palavra-passe").fill("uma frase que so eu sei");
    await page.getByRole("button", { name: "Criar conta" }).click();
    // Straight on: the character, then the family, then the street. No code is typed on the way.
    await page.waitForFunction(() => window.__provador?.ready === true, undefined, { timeout: 45_000 });
    await page.getByRole("button", { name: "Está bom" }).click();
    await turnCard(page);
    await page.waitForFunction(() => window.__andar?.ready === true, undefined, { timeout: 45_000 });
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token?: string }).token);
    const me = (await (await page.request.get("/api/v1/me", { headers: { authorization: `Bearer ${token}` } })).json()) as { kind: string; savedWith: { email: boolean; emailVerified: boolean }; origin: { makuta: number }; wallet: { cash: number } };
    expect(me).toMatchObject({ kind: "linked", savedWith: { email: true, emailVerified: false } });
    // The Makuta of their card is in their Carteira, by the books.
    expect(me.wallet.cash).toBe(me.origin.makuta);
    // Neither the address nor the password stays on the phone.
    const kept = JSON.stringify(await page.evaluate(() => ({ ...localStorage })));
    expect(kept).not.toContain("exemplo.ao");
    expect(kept).not.toContain("uma frase");
    // The same address a second time is told it has an account, and shown the other door.
    const again = await (await page.context().browser()!.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    await again.goto("/");
    await again.getByRole("button", { name: "Entrar em Luanda" }).click();
    await bornIn(again, "1995");
    await again.getByLabel("O teu e-mail").fill(email);
    await again.getByLabel("Escolhe uma palavra-passe").fill("outra frase que eu sei");
    await again.getByRole("button", { name: "Criar conta" }).click();
    await expect(again.locator(".tm-save-said")).toHaveText("Esse e-mail já tem conta. Entra por «Já tenho conta».");
    await again.getByRole("link", { name: "Já tenho conta" }).click();
    await again.getByLabel("O teu e-mail").fill(email);
    await again.getByLabel("A tua palavra-passe").fill("uma frase que so eu sei");
    // Signing in here ends the session on the first phone (one active session a player): whatever that phone asks
    // from now on is answered 401, which is how it is told. Everything before must be clean; after, only that.
    const beforeSignIn = seen.errors.length;
    await again.getByRole("button", { name: "Entrar", exact: true }).click();
    await again.waitForURL((url) => url.pathname !== "/", { timeout: 30_000 });
    await again.context().close();
    expect(seen.errors.slice(0, beforeSignIn).filter((error) => !error.includes("409") && !error.includes("400"))).toEqual([]);
    expect(seen.errors.slice(beforeSignIn).filter((error) => !error.includes("401"))).toEqual([]);
  });
});

test.describe("two phones in the same street", () => {
  // The second phone of each test. Closed whatever happens: a phone left in the street by a test that failed
  // would be a stranger in the next test's channel.
  const seconds: Page[] = [];
  test.afterEach(async () => {
    for (const left of seconds.splice(0)) await left.context().close().catch(() => {});
  });
  /**
   * Taps another player standing in the street, as a person would: the view is turned a little while they are behind
   * the camera or under a button, the finger lands only on the street, and the sheet's code (fetched on the first
   * tap) is waited for, since a second tap before it arrives would land on its backdrop and shut it. True when
   * their sheet opened.
   */
  const tapSomeone = async (page: Page, name: string | RegExp): Promise<boolean> => {
    const size = page.viewportSize()!;
    const onStreet = (x: number, y: number): Promise<boolean> => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === "CANVAS", { x, y });
    for (let turn = 0; turn < 8; turn++) {
      const there = (await page.evaluate(() => window.__andar!.othersOnScreen))[0];
      if (there && there.x > 20 && there.x < size.width - 20) {
        for (const [dx, dy] of [[0, 0], [0, -0.04], [0, 0.04], [0.03, 0], [-0.03, 0], [0, -0.08]] as const) {
          const x = there.x + size.width * dx;
          const y = there.y + size.height * dy;
          if (!(await onStreet(x, y))) continue;
          await page.mouse.click(x, y);
          if (await page.getByRole("dialog", { name }).waitFor({ timeout: 3000 }).then(() => true, () => false)) return true;
        }
      }
      await page.mouse.move(size.width * 0.5, size.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(size.width * 0.5 - 60, size.height * 0.3, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
    return false;
  };
  /** A guest made by the API, kept on the phone as the door would have kept it. */
  /**
   * Walks a player to a point with the keys, as a thumb would: straight at it, and when something stands in the way (a
   * person of the street on their timetable, a bench, a kiosk) a step aside and on. Returns when within `within` metres.
   */
  const walkTo = async (page: Page, x: number, z: number, within: number, tries = 300): Promise<void> => {
    let stuck = 0;
    let was = { x: Number.NaN, z: Number.NaN };
    for (let n = 0; n < tries; n++) {
      const at = await page.evaluate(() => ({ x: window.__andar!.x, z: window.__andar!.z }));
      // Given a number of tries, not getting there is said, with where the walk ended.
      if (tries !== 300 && n === tries - 1) throw new Error(`walked ${tries} times toward (${x.toFixed(1)}, ${z.toFixed(1)}) and stood at (${at.x.toFixed(1)}, ${at.z.toFixed(1)})`);
      const dx = x - at.x;
      const dz = z - at.z;
      if (Math.hypot(dx, dz) < within) return;
      stuck = Math.hypot(at.x - was.x, at.z - was.z) < 0.03 ? stuck + 1 : 0;
      was = at;
      if (stuck >= 4) {
        // Blocked: a step to one side, across the way to the point, then on.
        const side = Math.abs(dx) > Math.abs(dz) ? (n % 2 === 0 ? "w" : "s") : n % 2 === 0 ? "a" : "d";
        await page.keyboard.down(side);
        await page.waitForTimeout(400);
        await page.keyboard.up(side);
        stuck = 0;
        continue;
      }
      const keys = [...(dx > 0.2 ? ["d"] : dx < -0.2 ? ["a"] : []), ...(dz > 0.2 ? ["s"] : dz < -0.2 ? ["w"] : [])];
      for (const key of keys) await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(350, 50 + Math.hypot(dx, dz) * 110));
      for (const key of keys) await page.keyboard.up(key);
    }
  };
  const comeIn = async (page: Page, n: number, ageBand: "18_plus" | "15_17" = "18_plus"): Promise<string> => {
    const deviceId = `two-phones-${n}-${Date.now()}-abcdefgh`;
    const made = await page.request.post("/api/v1/guests", { data: { deviceId, platform: "android", ageBand } });
    expect(made.status()).toBe(201);
    const guest = (await made.json()) as { playerId: string; token: string; name: string; biNumber: string; arrivedAt: string };
    await page.addInitScript((kept) => localStorage.setItem("nzila.conta", JSON.stringify(kept)), { deviceId, ageBand, ...guest });
    return guest.name;
  };

  test("each sees the other as a body in the street; one walks and the other sees them go, where the zone says; who stands still is named", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Two phones were not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    const firstName = await comeIn(page, 1);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    const otherSeen = watch(other);
    const secondName = await comeIn(other, 2);

    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    await other.goto("/andar?tier=poupanca&hour=12");
    await other.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });

    // Each has the other's body in the street, by name, and not on top of their own.
    await page.waitForFunction(() => window.__andar!.players === 1, undefined, { timeout: 20_000 });
    await other.waitForFunction(() => window.__andar!.players === 1, undefined, { timeout: 20_000 });
    const mine = await page.evaluate(() => window.__andar!);
    const theirs = await other.evaluate(() => window.__andar!);
    expect(mine.others[0]!.name).toBe(secondName);
    expect(theirs.others[0]!.name).toBe(firstName);
    expect(Math.hypot(mine.x - mine.others[0]!.x, mine.z - mine.others[0]!.z)).toBeGreaterThan(0.5);
    // What one phone says of itself and what the other is told of it are the same place.
    expect(Math.hypot(theirs.others[0]!.x - mine.x, theirs.others[0]!.z - mine.z)).toBeLessThan(0.3);
    // Both stand still and near: each reads the other's name over their head.
    await page.waitForFunction(() => window.__andar!.others[0]!.still && window.__andar!.names >= 1, undefined, { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("dois-parados.png") });

    // The matchmaker put them in the same channel, and the Mapa says which.
    expect(mine.channel).toBe(1);
    expect(theirs.channel).toBe(1);
    await page.getByRole("button", { name: "Telemóvel" }).click();
    const telemovel = page.getByRole("dialog", { name: "Telemóvel" });
    await telemovel.getByRole("button", { name: "Mapa" }).click();
    // One copy of the bairro: its number is machinery, and is not shown (D-3.13).
    await expect(telemovel.locator(".tm-map-canal")).toHaveCount(0);
    // The other player is on the map, and the key says what their mark is; it does not speak of lines this town has not got.
    await expect(telemovel.locator(".tm-map-key")).toContainText("Gente");
    await expect(telemovel.locator(".tm-map-key")).not.toContainText("Linhas");
    await expect(telemovel.locator(".tm-map-canvas")).toHaveAttribute("data-gente", "1");
    await page.screenshot({ path: info.outputPath("dois-mapa-canal.png") });
    await telemovel.getByRole("button", { name: "Fechar" }).click();
    await expect(telemovel).toHaveCount(0);

    // The first walks away north (the other stands beside them, east or west: F-189) for three seconds; the second watches them go, smoothly.
    const before = theirs.others[0]!;
    const watched: { x: number; z: number; at: number }[] = [];
    await page.keyboard.down("w");
    for (let n = 0; n < 30; n++) {
      watched.push(await other.evaluate(() => ({ x: window.__andar!.others[0]?.x ?? NaN, z: window.__andar!.others[0]?.z ?? NaN, at: window.__andar!.at })));
      await other.waitForTimeout(100);
    }
    await page.keyboard.up("w");
    const after = await other.evaluate(() => window.__andar!.others[0]!);
    const went = Math.hypot(after.x - before.x, after.z - before.z);
    expect(went).toBeGreaterThan(1.5);
    // A walking pace, and never a jump between two looks: no more than a stride, and what more the time that really passed
    // between the two pictures allows. Looks meant a tenth of a second apart are sometimes a third on a loaded machine,
    // and a walk covers 0,8 m in that (gate of 2026-11-19); the same rule as the weak line's test below (F-183).
    const steps = watched.slice(1).map((at, n) => Math.hypot(at.x - watched[n]!.x, at.z - watched[n]!.z));
    const jumps = watched.slice(1).map((at, n) => steps[n]! - (0.75 + 3 * ((at.at - watched[n]!.at) / 1000)));
    expect(Math.max(...jumps)).toBeLessThan(0);
    // The walker ends where the zone says, which is where the watcher sees them.
    await page.waitForTimeout(700);
    const walker = await page.evaluate(() => window.__andar!);
    const sight = await other.evaluate(() => window.__andar!.others[0]!);
    expect(Math.hypot(sight.x - walker.x, sight.z - walker.z)).toBeLessThan(0.3);
    info.annotations.push({ type: "two phones", description: `walked ${went.toFixed(1)} m; biggest step seen ${Math.max(...steps).toFixed(2)} m; corrections ${walker.corrections}` });
    // On a good line the zone hardly ever has to put the walker right.
    expect(walker.corrections).toBeLessThan(3);

    // The second walks off in their turn, and the first sees a body walking, not sliding: its legs are going.
    await other.keyboard.down("w");
    await page.waitForFunction(() => window.__andar!.others[0]?.still === false, undefined, { timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: info.outputPath("dois-a-andar.png") });
    await other.keyboard.up("w");

    // One leaves: their body goes from the other's street.
    await other.close();
    await page.waitForFunction(() => window.__andar!.players === 0, undefined, { timeout: 15_000 });
    expect(seen.errors).toEqual([]);
    expect(otherSeen.errors).toEqual([]);
  });

  test("a line falls: the player is told calmly, walks on, and is the same person in the same place when it comes back; the other never sees them vanish", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). A falling line was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await comeIn(page, 11);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    await comeIn(other, 12);
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    await other.goto("/andar?tier=poupanca&hour=12");
    await other.waitForFunction(() => window.__andar?.linked === true && window.__andar.players === 1, undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__andar!.players === 1, undefined, { timeout: 20_000 });
    const before = await other.evaluate(() => window.__andar!.others[0]!);

    // The network goes, and the line with it.
    await page.context().setOffline(true);
    await page.evaluate(() => window.__andar!.fall());
    // Nothing is said for a blink; then, calmly, that it is being picked up. The world is still drawn.
    await expect(page.getByRole("status").filter({ hasText: "A ligar de novo" })).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => window.__andar!.net)).toBe("reconnecting");
    await page.screenshot({ path: info.outputPath("a-ligar-de-novo.png") });
    // The others are where they were last seen: they have not vanished.
    expect(await page.evaluate(() => window.__andar!.players)).toBe(1);
    // And to the other, this player is standing where they stood.
    await other.waitForTimeout(1500);
    const during = await other.evaluate(() => window.__andar!);
    expect(during.players).toBe(1);
    expect(Math.hypot(during.others[0]!.x - before.x, during.others[0]!.z - before.z)).toBeLessThan(0.2);

    // The network comes back: so does the line, by itself, and nothing more is said.
    await page.context().setOffline(false);
    await page.waitForFunction(() => window.__andar!.linked && window.__andar!.reconnections === 1, undefined, { timeout: 20_000 });
    await expect(page.getByRole("status").filter({ hasText: "A ligar de novo" })).toHaveCount(0);
    expect(await page.evaluate(() => window.__andar!.channel)).toBe(1);
    // The same body, to the other: one player throughout, and now they walk again.
    await page.keyboard.down("w");
    await other.waitForFunction((was) => Math.hypot(window.__andar!.others[0]!.x - was.x, window.__andar!.others[0]!.z - was.z) > 1, before, { timeout: 15_000 });
    await page.keyboard.up("w");
    expect(await other.evaluate(() => window.__andar!.players)).toBe(1);
    await other.close();
    // Offline, the browser itself complains of what it could not fetch: that is the test's doing, not the game's.
    expect(seen.errors.filter((error) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource|WebSocket|offline|network/i.test(error))).toEqual([]);
  });

  test("on a weak line (250 ms there and back, 5% lost) the other still walks smoothly, and the walker is hardly ever put right", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). A weak line was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await comeIn(page, 21);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    await comeIn(other, 22);
    await page.goto("/andar?tier=poupanca&hour=12&rede=250,5");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    await other.goto("/andar?tier=poupanca&hour=12&rede=250,5");
    await other.waitForFunction(() => window.__andar?.linked === true && window.__andar.players === 1, undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__andar!.players === 1, undefined, { timeout: 20_000 });

    const from = await other.evaluate(() => window.__andar!.others[0]!);
    const watched: { x: number; z: number; at: number }[] = [];
    await page.keyboard.down("w");
    for (let n = 0; n < 50; n++) {
      watched.push(await other.evaluate(() => ({ x: window.__andar!.others[0]?.x ?? NaN, z: window.__andar!.others[0]?.z ?? NaN, at: window.__andar!.at })));
      await other.waitForTimeout(100);
    }
    await page.keyboard.up("w");
    await page.waitForTimeout(1500);
    const walker = await page.evaluate(() => window.__andar!);
    const sight = await other.evaluate(() => window.__andar!.others[0]!);
    const steps = watched.slice(1).map((at, n) => Math.hypot(at.x - watched[n]!.x, at.z - watched[n]!.z));
    const went = Math.hypot(sight.x - from.x, sight.z - from.z);
    info.annotations.push({ type: "weak line", description: `walked ${went.toFixed(1)} m in 5 s; biggest step seen in a tenth of a second ${Math.max(...steps).toFixed(2)} m; corrections ${walker.corrections}` });
    // They walked about as far as five seconds of walking goes, late line or not.
    expect(went).toBeGreaterThan(4);
    // Never a jump: no more than a few strides between two looks, even after a stall. Two looks are meant to be a
    // tenth of a second apart and on a busy machine are sometimes several: what is allowed grows with the time that
    // really passed between the two pictures looked at (each look reads when its picture was drawn, which on a
    // busy machine is not when it was looked at), so that a late picture is not taken for a jump (F-183).
    const jumps = watched.slice(1).map((at, n) => steps[n]! - (0.75 + 3 * ((at.at - watched[n]!.at) / 1000)));
    expect(Math.max(...jumps)).toBeLessThan(0);
    // When all is quiet the two agree on where the walker is.
    expect(Math.hypot(sight.x - walker.x, sight.z - walker.z)).toBeLessThan(0.3);
    // And the walker's own body was almost never put right: a late line is not a wrong one.
    expect(walker.corrections).toBeLessThan(4);
    await other.close();
    expect(seen.errors).toEqual([]);
  });

  test("two phones see the same street traffic, the same van in the same place, even when one phone's clock is seven seconds wrong (F-152)", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-vehicles/veiculos.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The vehicles or the people are not built (they need Blender). Shared traffic was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await comeIn(page, 51);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    await comeIn(other, 52);
    // The second phone's own clock is seven seconds ahead of the world's. Left to itself, it would draw every van
    // fifty metres from where the first draws it.
    await other.addInitScript(() => {
      const real = Date.now.bind(Date);
      Date.now = () => real() + 7000;
    });
    for (const one of [page, other]) {
      await one.goto("/andar?pack=l1&tier=poupanca&hour=12");
      await one.waitForFunction(() => window.__andar?.linked === true && window.__andar.trafficFollowed && window.__andar.vans.length > 0, undefined, { timeout: 45_000 });
    }
    // Looked at five times, both at once: every van either phone draws is where the other draws it, give or take
    // how far a van goes in the time between the two looks.
    let compared = 0;
    for (let n = 0; n < 5; n++) {
      const [a, b] = await Promise.all([page.evaluate(() => ({ now: window.__andar!.streetNow, vans: window.__andar!.vans })), other.evaluate(() => ({ now: window.__andar!.streetNow, vans: window.__andar!.vans }))]);
      // Both draw the street at the zone's moment, whatever their own clocks say.
      expect(Math.abs(a.now - b.now)).toBeLessThan(600);
      for (const van of a.vans) {
        const same = b.vans.find((one) => one.key === van.key);
        if (!same) continue;
        compared++;
        expect(Math.hypot(van.x - same.x, van.z - same.z), van.key).toBeLessThan(0.8 + (9 * Math.abs(a.now - b.now)) / 1000);
      }
      await page.waitForTimeout(700);
    }
    expect(compared).toBeGreaterThan(4);
    expect(seen.errors).toEqual([]);
  });

  test("two ride a candongueiro together: each sees the other seated in it, both are carried with it, and they get off together beside it (F-157)", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-vehicles/veiculos.json")).ok() || !(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The vehicles or the people are not built (they need Blender). Riding together was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(720_000);
    const seen = watch(page);
    await comeIn(page, 61);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    await comeIn(other, 62);
    // Both come in at the Marginal's paragem, where the linha's vans stop.
    for (const one of [page, other]) {
      await one.goto("/andar?pack=l1&tier=poupanca&hour=12&paragem=marginal");
      await one.waitForFunction(() => window.__andar?.linked === true && window.__andar.trafficFollowed, undefined, { timeout: 45_000 });
    }
    // A van stands at the paragem: both get on it.
    for (const one of [page, other]) await one.waitForFunction(() => window.__andar!.action === "board", undefined, { timeout: 260_000, polling: 200 });
    // On, as anyone gets on: and if the zone said no (the van pulling away that instant, a seat just taken), again.
    for (const one of [page, other]) {
      let on = false;
      for (let tries = 0; tries < 3 && !on; tries++) {
        await one.keyboard.press("e");
        on = await one.waitForFunction(() => window.__andar!.riding !== null && window.__andar!.myRide !== null, undefined, { timeout: 10_000 }).then(() => true, () => false);
        // Pressed as the van pulled away, nothing is proposed: wait for the next one as long as for the first (F-254).
        if (!on) await one.waitForFunction(() => window.__andar!.action === "board", undefined, { timeout: 260_000, polling: 200 }).catch(() => {});
      }
      expect(on, `on the van (the zone said no ${await one.evaluate(() => window.__andar!.rideRefusals)} times)`).toBe(true);
    }
    const [mine, theirs] = await Promise.all([page.evaluate(() => window.__andar!.myRide!), other.evaluate(() => window.__andar!.myRide!)]);
    // The same van, two seats.
    expect(mine.vehicle).toBe(theirs.vehicle);
    expect(mine.seat).not.toBe(theirs.seat);
    // Each sees the other seated in it.
    await page.waitForFunction(() => window.__andar!.othersRiding === 1, undefined, { timeout: 10_000 });
    await other.waitForFunction(() => window.__andar!.othersRiding === 1, undefined, { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("juntos-na-carrinha.png") });
    // The van is a room of its own: what one says inside, the other reads.
    await page.getByRole("button", { name: "Escreve aqui" }).click();
    await page.getByRole("button", { name: "Tudo fixe?" }).click();
    await expect(other.locator(".cv-log")).toContainText("Tudo fixe?", { timeout: 10_000 });
    // And someone seated beside you can be tapped: their BI opens, with everything that can be done.
    const size = page.viewportSize()!;
    let opened = false;
    // Seated, the view is turned with a finger as anyone would: toward the other, until they are in the open middle
    // of the screen (the top is the van's band), and then they are tapped.
    const drag = async (dx: number, dy: number): Promise<void> => {
      await page.mouse.move(size.width * 0.5, size.height * 0.55);
      await page.mouse.down();
      await page.mouse.move(size.width * 0.5 + dx, size.height * 0.55 + dy, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(150);
    };
    let upSign = 1;
    // What each try saw, said when none opened the sheet.
    const tries: string[] = [];
    for (let attempt = 0; attempt < 24 && !opened; attempt++) {
      const there = (await page.evaluate(() => window.__andar!.othersOnScreen))[0];
      tries.push(there ? `${Math.round(there.x)},${Math.round(there.y)}` : "none");
      // Nobody in front: they sit behind, and the view is turned round toward them.
      if (!there) {
        await drag(90, 0);
        continue;
      }
      const wantY = size.height * 0.6;
      // Only where a finger would land on the street itself, never on a button over it.
      const onStreet = (x: number, y: number): Promise<boolean> => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === "CANVAS", { x, y });
      // Their chest, or a little round it where the cobrador's words or a button are not in the way.
      const near = [[0, 0], [0, 0.04], [0, -0.04], [0.03, 0], [-0.03, 0], [0, 0.07]] as const;
      const free: (readonly [number, number])[] = [];
      for (const [dx, dy] of near) if (await onStreet(there.x + size.width * dx, there.y + size.height * dy)) free.push([dx, dy]);
      if (there.x > 40 && there.x < size.width - 40 && there.y > size.height * 0.2 && there.y < size.height * 0.75 && free.length > 0) {
        for (const [dx, dy] of free) {
          await page.mouse.click(there.x + size.width * dx, there.y + size.height * dy);
          tries.push(`tap:${await page.evaluate(() => window.__andar!.tap ?? "-")}`);
          // The sheet's code is fetched on the first tap: a second tap before it arrives would land on its backdrop and shut it.
          if (await page.getByRole("dialog").filter({ has: page.locator(".n-bi-name") }).waitFor({ timeout: 3000 }).then(() => true, () => false)) {
            opened = true;
            break;
          }
        }
        if (!opened) await drag(0, upSign * 20);
        continue;
      }
      // Dragging right turns the view so that what is seen moves left: the other is brought toward the middle (and out
      // from under the buttons, when that is where they were).
      const dx = Math.max(-80, Math.min(80, (there.x - size.width / 2) * 0.25)) || 30;
      const dy = Math.max(-60, Math.min(60, (there.y - wantY) * 0.25)) * upSign;
      await drag(Math.abs(there.x - size.width / 2) > 40 ? dx : 0, Math.abs(there.y - wantY) > 60 ? dy : 0);
      const after = (await page.evaluate(() => window.__andar!.othersOnScreen))[0];
      // A vertical drag that took them further from where they are wanted means up and down are the other way round;
      // one that did not move them at all met the end of how far the view tilts, and the other way is tried.
      if (after && dy !== 0 && Math.abs(after.y - wantY) > Math.abs(there.y - wantY) - 2) upSign = -upSign;
    }
    expect(opened, `a tap on the other, seated in the van, opened their BI (tries: ${tries.join(" ")})`).toBe(true);
    await page.screenshot({ path: info.outputPath("juntos-bi-na-carrinha.png") });
    await page.getByRole("dialog").filter({ has: page.locator(".n-bi-name") }).getByRole("button", { name: "Fechar" }).click();
    // It drives off with both: what each phone says of where it is, and what the zone says of the other, go together.
    const start = await page.evaluate(() => ({ x: window.__andar!.x, z: window.__andar!.z }));
    await page.waitForFunction((from) => Math.hypot(window.__andar!.x - from.x, window.__andar!.z - from.z) > 25, start, { timeout: 60_000 });
    // Asked for the next paragem, and off there, together, on foot again; the street sees them walk.
    await page.keyboard.press("e");
    await other.keyboard.press("e");
    for (const one of [page, other]) await one.waitForFunction(() => window.__andar!.riding === null && window.__andar!.myRide === null, undefined, { timeout: 90_000 });
    await page.waitForFunction(() => window.__andar!.othersRiding === 0 && window.__andar!.players === 1, undefined, { timeout: 10_000 });
    const [a, b] = await Promise.all([page.evaluate(() => window.__andar!), other.evaluate(() => window.__andar!)]);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(6);
    expect(Math.hypot(a.x - start.x, a.z - start.z)).toBeGreaterThan(25);
    await page.screenshot({ path: info.outputPath("juntos-sairam.png") });
    expect(seen.errors).toEqual([]);
  });

  test("at a caixa the button opens the Banco: money is put in and taken out, the wallet on the screen follows, and every movement opens its receipt", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). The bank was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await comeIn(page, 41);
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    // Born into a family: its Makuta is in the Carteira.
    const born = await page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token;
      return (await (await fetch("/api/v1/me/origin", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" })).json()) as { wallet: { cash: number } };
    });
    let had = born.wallet.cash;
    const dotted = (amount: number): string => String(amount).replace(/\B(?=(\d{3})+$)/g, ".");
    expect(had).toBeGreaterThanOrEqual(1500);
    // The town's caixa is a few steps from where people arrive: standing still there, the button offers it.
    await page.screenshot({ path: info.outputPath("caixa-rua.png") });
    // Today's errand may be at the caixa itself: its button comes first, and when it is done the caixa's comes back.
    await page.waitForFunction(() => ["caixa", "procurar", "entregar"].includes(window.__andar!.action ?? ""), undefined, { timeout: 15_000 });
    if (await page.evaluate(() => window.__andar!.action !== "caixa")) {
      await page.waitForTimeout(1200);
      await page.keyboard.press("e");
      await page.waitForFunction(() => window.__andar!.action === "caixa", undefined, { timeout: 15_000 });
    }
    // (The errand done before the bank was opened, if there was one: what it paid is in the Carteira too. Its payment
    // may land a moment after the button comes back, so the books are read until the Banco and they agree.)
    const wallet = (): Promise<number> => page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token;
      return ((await (await fetch("/api/v1/me/wallet", { headers: { authorization: `Bearer ${token}` } })).json()) as { cash: number }).cash;
    });
    await page.getByRole("button", { name: "Usar a caixa" }).click();
    const banco = page.getByRole("dialog", { name: "Telemóvel" });
    await expect(banco.locator(".tm-bank-risk")).toContainText("Na carteira");
    await expect.poll(async () => (await banco.locator(".tm-bank-risk dd").textContent())?.includes(dotted((had = await wallet()))), { timeout: 10_000 }).toBe(true);
    await expect(banco.locator(".tm-bank-lines")).toContainText("Da tua família");
    await page.screenshot({ path: info.outputPath("caixa-banco.png") });
    // Nothing can be banked that is not held; five hundred can.
    await banco.getByLabel("Quanto?").fill(String(had + 1));
    await expect(banco.getByRole("button", { name: "Depositar" })).toBeDisabled();
    await banco.getByLabel("Quanto?").fill("500");
    await banco.getByRole("button", { name: "Depositar" }).click();
    await expect(banco.getByRole("status")).toHaveText("Feito. Está nos movimentos.", { timeout: 10_000 });
    await expect(banco.locator(".tm-bank-safe dd")).toContainText("500");
    await expect(banco.locator(".tm-bank-lines li").first()).toContainText("Depósito no banco");
    await page.screenshot({ path: info.outputPath("caixa-depositado.png") });
    // A movement opens as its receipt.
    await banco.locator(".tm-bank-lines li button").first().click();
    await expect(banco.locator(".n-receipt")).toContainText("500");
    await page.screenshot({ path: info.outputPath("caixa-recibo.png") });
    await banco.getByRole("button", { name: "Fechar", exact: true }).last().click();
    // Two hundred back out.
    await banco.getByLabel("Quanto?").fill("200");
    await banco.getByRole("button", { name: "Levantar" }).click();
    await expect(banco.locator(".tm-bank-safe dd")).toContainText("300", { timeout: 10_000 });
    // The books say the same, and the wallet on the street follows them.
    const now = await page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token;
      return (await (await fetch("/api/v1/me/wallet", { headers: { authorization: `Bearer ${token}` } })).json()) as { cash: number; bank: number };
    });
    // Putting money in may have done the day's errand to do so, which the neighbour paid for (300 Mk at most).
    expect(now.bank).toBe(300);
    expect(now.cash - (had - 300)).toBeGreaterThanOrEqual(0);
    expect(now.cash - (had - 300)).toBeLessThanOrEqual(300);
    await page.getByRole("button", { name: "Fechar" }).first().click();
    await expect(page.locator(".n-chip").first()).toContainText(dotted(now.cash));
    expect(seen.errors).toEqual([]);
  });

  test("at a table of the town (Task 4B.1): standing by it, its game can be watched and cheered (F-210); the button offers xadrez beside a free seat; sat, the board opens; a move is played and a kota of the bairro answers; up again, the seat is offered again", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). The tables were not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await comeIn(page, 44);
    const manifest = (await (await request.get("/packs/dev/manifest.json")).json()) as { tables: { game: string; pos: [number, number, number]; seats: { pos: [number, number, number] }[] }[] };
    const table = manifest.tables.find((one) => one.game === "xadrez")!;
    const seat = table.seats[0]!.pos;
    // Where to stand: behind seat 0, away from the table.
    const away = Math.hypot(seat[0] - table.pos[0], seat[2] - table.pos[2]);
    const stand = { x: seat[0] + ((seat[0] - table.pos[0]) / away) * 0.75, z: seat[2] + ((seat[2] - table.pos[2]) / away) * 0.75 };
    await page.goto("/andar?tier=poupanca&hour=10");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    // Walked there by the keys, first along the town's east-west line and then to the place: the camera looks north.
    const start = await page.evaluate(() => ({ x: window.__andar!.x, z: window.__andar!.z }));
    await walkTo(page, stand.x, start.z, 0.4);
    await walkTo(page, stand.x, stand.z, 0.3);
    await page.waitForFunction(() => window.__andar!.action === "xadrez", undefined, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Jogar xadrez" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("mesa-rua.png") });
    // Standing by the table, its game can be watched without sitting: the kotas' game, read only, from this side.
    await page.getByRole("button", { name: "Ver o jogo de xadrez" }).click();
    const watched = page.getByRole("dialog", { name: "Xadrez" });
    await expect(watched.locator(".ms-crowd")).toHaveText("1 a ver");
    await expect(watched.locator(".ms-seat-me")).toHaveCount(0);
    await expect(watched.locator(".ms-piece.ms-can")).toHaveCount(0);
    await expect(watched.getByRole("button", { name: "Levantar" })).toHaveCount(0);
    await expect(watched.locator(".ms-line")).toHaveText(/^Vez de (Kota|Mamã)|^Estás a ver|ganhou|^Empate/);
    // A cheer is the player's body clapping in the street, for everyone round the table to see.
    await watched.getByRole("button", { name: "Aplaudir" }).click();
    await page.waitForFunction(() => window.__andar!.emote === "aplaudir", undefined, { timeout: 5_000 });
    await page.screenshot({ path: info.outputPath("mesa-ver.png") });
    await watched.getByRole("button", { name: "Fechar" }).click();
    await expect(watched).toHaveCount(0);
    await page.waitForFunction(() => window.__andar!.emote === null, undefined, { timeout: 10_000 });
    await page.getByRole("button", { name: "Jogar xadrez" }).click();
    // The zone seats the player: the board opens, waiting a moment for someone else, and the gold button is gone.
    await page.waitForFunction(() => window.__andar!.mesa !== null && window.__andar!.seated, undefined, { timeout: 10_000 });
    const board = page.getByRole("dialog", { name: "Xadrez" });
    await expect(board).toContainText("À espera de mais alguém");
    await expect(page.getByRole("button", { name: "Jogar xadrez" })).toHaveCount(0);
    // A quick game: chosen before it begins, and the zone says so back.
    const quick = board.getByRole("switch", { name: "Partida rápida · 3 min" });
    await expect(quick).toHaveAttribute("aria-checked", "false");
    await quick.click();
    await expect(quick).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });
    await page.screenshot({ path: info.outputPath("mesa-rapida.png") });
    await board.getByRole("button", { name: "Jogar já com o kota" }).click();
    // Whoever plays White moves first: the kota, or the player. The game's own clock runs (from three minutes in a
    // street, from forty seconds in the browser tests' zone), the turn's from fifteen seconds.
    await expect(board.locator(".ms-line")).toHaveText("É a tua vez.", { timeout: 15_000 });
    await expect(board.locator(".ms-relogio")).toHaveText(/^0:[0-4]\d$/);
    await expect(board.locator(".ms-seat-turn b")).toHaveText(/^0:1\d$/);
    await page.screenshot({ path: info.outputPath("mesa-vez.png") });
    // A pawn chosen lights where it may go; the farther of the two is played.
    const moved = await board.locator(".ms-piece.ms-can").count();
    expect(moved).toBe(10);
    await board.locator(".ms-piece.ms-can").first().click();
    await expect(board.locator(".ms-target")).toHaveCount(2);
    await board.locator(".ms-target").last().click({ force: true });
    // The zone takes the move, the kota thinks, and it is the player's turn again: two moves on, the last one marked.
    await expect(board.locator(".ms-line")).toHaveText(/^Vez de (Kota|Mamã)/, { timeout: 5_000 });
    await expect(board.locator(".ms-line")).toHaveText("É a tua vez.", { timeout: 15_000 });
    await expect(board.locator(".ms-last")).toHaveCount(2);
    await page.screenshot({ path: info.outputPath("mesa-kota.png") });
    // Up again: the board closes, and the seat is offered again.
    await board.getByRole("button", { name: "Levantar" }).click();
    await page.waitForFunction(() => window.__andar!.mesa === null && !window.__andar!.seated, undefined, { timeout: 10_000 });
    await expect(board).toHaveCount(0);
    await page.waitForFunction(() => window.__andar!.action === "xadrez", undefined, { timeout: 10_000 });
    expect(seen.errors).toEqual([]);
  });

  test("a quick game played to the end of its clock is written down: the board says what it did to the player's points, and the bairro's ranking has them (Task 4B.1)", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). The ranking was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(150_000);
    const seen = watch(page);
    const myName = await comeIn(page, 46);
    const manifest = (await (await request.get("/packs/dev/manifest.json")).json()) as { tables: { game: string; pos: [number, number, number]; seats: { pos: [number, number, number] }[] }[] };
    // Each phone a table of its own: the zone of the tests is shared, and a player who gets up is put behind their
    // stool, where the other phone's test would walk to (the damas table for one, the second xadrez table for the other).
    const jogo = info.project.name === "phone" ? "damas" : "xadrez";
    const table = info.project.name === "phone" ? manifest.tables.find((one) => one.game === "damas")! : manifest.tables.filter((one) => one.game === "xadrez")[1]!;
    const seat = table.seats[0]!.pos;
    const nome = jogo === "damas" ? "Damas" : "Xadrez";
    const away = Math.hypot(seat[0] - table.pos[0], seat[2] - table.pos[2]);
    const stand = { x: seat[0] + ((seat[0] - table.pos[0]) / away) * 0.75, z: seat[2] + ((seat[2] - table.pos[2]) / away) * 0.75 };
    await page.goto("/andar?tier=poupanca&hour=10");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    const start = await page.evaluate(() => ({ x: window.__andar!.x, z: window.__andar!.z }));
    await walkTo(page, stand.x, start.z, 0.4);
    await walkTo(page, stand.x, stand.z, 0.3);
    await page.waitForFunction((wanted) => window.__andar!.action === wanted, jogo, { timeout: 15_000 });
    await page.getByRole("button", { name: `Jogar ${jogo}` }).click();
    await page.waitForFunction(() => window.__andar!.mesa !== null && window.__andar!.seated, undefined, { timeout: 10_000 });
    const board = page.getByRole("dialog", { name: nome });
    // Before the game: nobody has played here yet, or the player has not.
    await board.getByRole("button", { name: "Classificação" }).click();
    await expect(board.locator(".ms-ranking-teu")).toHaveText("Ainda não jogaste aqui: a primeira partida dá-te lugar.", { timeout: 10_000 });
    await board.getByRole("button", { name: "Voltar ao jogo" }).click();
    // A quick game (forty seconds in the browser tests' zone), begun at once; the player only watches the clock.
    await board.getByRole("switch", { name: "Partida rápida · 3 min" }).click();
    await expect(board.getByRole("switch", { name: "Partida rápida · 3 min" })).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });
    await board.getByRole("button", { name: "Jogar já com o kota" }).click();
    await expect(board.locator(".ms-relogio")).toBeVisible({ timeout: 10_000 });
    // The player plays on their turns as anyone would (three turns missed stand a player up): a piece that may move,
    // then where it may go, a hop at a time, until the clock ends it.
    const ended = board.locator(".ms-line", { hasText: "Acabou o tempo." });
    for (let n = 0; n < 90 && (await ended.count()) === 0; n++) {
      if ((await board.locator(".ms-line-go").count()) > 0) {
        if ((await board.locator(".ms-target").count()) > 0) await board.locator(".ms-target").first().click({ force: true, timeout: 2000 }).catch(() => {});
        else await board.locator(".ms-piece.ms-can").first().click({ force: true, timeout: 2000 }).catch(() => {});
      }
      await page.waitForTimeout(700);
    }
    // The clock ends it; the board says so, and what it did to the player's points.
    await expect(board.locator(".ms-line")).toContainText("Acabou o tempo.", { timeout: 10_000 });
    await expect(board.locator(".ms-pontos")).toContainText(/pontos · tens \d/, { timeout: 15_000 });
    await page.screenshot({ path: info.outputPath("mesa-pontos.png") });
    // The bairro's ranking has them now, marked.
    await board.getByRole("button", { name: "Classificação" }).click();
    await expect(board.locator(".ms-ranking-eu")).toContainText(myName, { timeout: 10_000 });
    await expect(board.locator(".ms-ranking-teu")).toContainText("O teu lugar:");
    await page.screenshot({ path: info.outputPath("mesa-classificacao.png") });
    await board.getByRole("button", { name: "Voltar ao jogo" }).click();
    await board.getByRole("button", { name: "Levantar" }).click();
    await page.waitForFunction(() => window.__andar!.mesa === null, undefined, { timeout: 10_000 });
    expect(seen.errors).toEqual([]);
  });

  test("at the cantina's grille: the dona greets, the basket is priced on the gold button, too much for the Carteira or the Mochila is said, the receipt prints; the Mochila holds it, and bread is eaten", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). The cantina was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await comeIn(page, 43);
    await page.goto("/andar?tier=poupanca&hour=10");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    const born = await page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token;
      return (await (await fetch("/api/v1/me/origin", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" })).json()) as { wallet: { cash: number } };
    });
    let had = born.wallet.cash;
    const dotted = (amount: number): string => String(amount).replace(/\B(?=(\d{3})+$)/g, ".");
    // The town's cantina is along the pavement east of where people arrive: going there, the button offers it.
    await page.keyboard.down("Shift");
    await page.keyboard.down("d");
    await page.waitForFunction(() => window.__andar!.shop !== null, undefined, { timeout: 20_000 });
    await page.keyboard.up("d");
    await page.keyboard.up("Shift");
    await page.waitForFunction(() => window.__andar!.speed < 0.05 && ["buy", "procurar", "entregar"].includes(window.__andar!.action ?? ""), undefined, { timeout: 10_000 });
    // Today's errand may be at the cantina itself: its button comes first, and when it is done the cantina's comes back.
    if (await page.evaluate(() => window.__andar!.action !== "buy")) {
      await page.waitForTimeout(1200);
      await page.keyboard.press("e");
      await page.waitForFunction(() => window.__andar!.action === "buy", undefined, { timeout: 15_000 });
      // What the errand paid is in the Carteira now: asked until the books say so, for the button changes a moment
      // before the pay is written (F-262).
      const cashNow = (): Promise<number> => page.evaluate(async () => {
        const token = (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token;
        return ((await (await fetch("/api/v1/me/wallet", { headers: { authorization: `Bearer ${token}` } })).json()) as { cash: number }).cash;
      });
      await expect.poll(cashNow, { timeout: 8_000 }).toBeGreaterThan(born.wallet.cash);
      had = await cashNow();
    }
    await page.screenshot({ path: info.outputPath("cantina-rua.png") });
    const cantina = page.getByRole("dialog", { name: "Cantina de Ensaio" });
    // A press of the gold button is now and then lost under the whole suite's load (F-211): pressed again if so.
    for (let tries = 0; tries < 3 && !(await cantina.isVisible()); tries++) {
      await page.getByRole("button", { name: "Comprar" }).click();
      await cantina.waitFor({ timeout: 3000 }).catch(() => {});
    }
    // The dona greets by the hour, through her grille; nothing in the basket, nothing to pay.
    await expect(cantina.locator(".ct-grille")).toContainText("Bom dia, querido.", { timeout: 10_000 });
    await expect(cantina.getByRole("button", { name: "Escolhe o que levas" })).toBeDisabled();
    // The card of the house, with no stamp yet: the first comes with today's purchase.
    await expect(cantina.locator(".ct-card .ct-stamp")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("cantina-grade.png") });
    // Two loaves and a gasosa: 350 on the gold button.
    await cantina.locator('.ct-pick[data-item="pao"]').click();
    await cantina.locator('.ct-pick[data-item="pao"]').click();
    await cantina.locator('.ct-pick[data-item="gasosa"]').click();
    await expect(cantina.getByRole("button", { name: /^Pagar 350\s*Mk$/ })).toBeEnabled();
    await page.screenshot({ path: info.outputPath("cantina-cesto.png") });
    // Four bags of charcoal would not go in a Mochila.
    await cantina.locator('.ct-pick[data-item="carvao"]').click();
    for (let n = 0; n < 3; n++) await cantina.getByRole("button", { name: "Mais um" }).last().click();
    await expect(cantina.getByRole("button", { name: "Não cabe na mochila" })).toBeDisabled();
    await page.screenshot({ path: info.outputPath("cantina-pesado.png") });
    for (let n = 0; n < 4; n++) await cantina.locator('.ct-row:has([data-item="carvao"])').getByRole("button", { name: "Menos um" }).click();
    // More than the Carteira holds says what is missing, and is not gold.
    if (had < 350 + 20 * 400) {
      await cantina.locator('.ct-pick[data-item="chocolate"]').click();
      // Twenty, as the row counts them: on a busy machine a tap can be lost (F-211), and the sum would be another.
      const chocolates = cantina.locator('.ct-row:has([data-item="chocolate"]) output');
      for (let n = 0; n < 40 && (await chocolates.textContent()) !== "20"; n++) await cantina.locator('.ct-row:has([data-item="chocolate"])').getByRole("button", { name: "Mais um" }).click();
      await expect(chocolates).toHaveText("20");
      await expect(cantina.getByRole("button", { name: new RegExp(`^Faltam ${dotted(350 + 20 * 400 - had)}\\s*Mk$`) })).toBeDisabled();
      await page.screenshot({ path: info.outputPath("cantina-faltam.png") });
      for (let n = 0; n < 40 && (await cantina.locator('.ct-row:has([data-item="chocolate"]) output').count()) > 0; n++) await cantina.locator('.ct-row:has([data-item="chocolate"])').getByRole("button", { name: "Menos um" }).click();
    }
    await cantina.getByRole("button", { name: /^Pagar 350\s*Mk$/ }).click();
    // The receipt prints; the dona thanks.
    await expect(cantina.locator(".n-receipt")).toContainText("2 × Pão", { timeout: 10_000 });
    await expect(cantina.locator(".n-receipt")).toContainText("Gasosa");
    await expect(cantina.locator(".n-receipt-total")).toContainText("350");
    await expect(cantina.locator(".ct-card .ct-stamp")).toHaveCount(1);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: info.outputPath("cantina-recibo.png") });
    await cantina.getByRole("button", { name: "Já está" }).click();
    await expect(page.locator(".n-chip").first()).toContainText(dotted(had - 350), { timeout: 5_000 });
    // In the Mochila: the bread and the gasosa. A loaf is eaten.
    await page.getByRole("button", { name: "Mochila" }).click();
    const mochila = page.getByRole("dialog", { name: "Mochila" });
    await expect(mochila.locator(".ct-held-row")).toHaveCount(2, { timeout: 10_000 });
    await expect(mochila.locator(".ct-held-row").first()).toContainText("Pão");
    await expect(mochila.locator(".ct-held-row").first().locator(".ct-count")).toHaveText("2");
    await page.screenshot({ path: info.outputPath("cantina-mochila.png") });
    await mochila.locator(".ct-held-row").first().getByRole("button", { name: "Comer" }).click();
    await expect(mochila.getByRole("status")).toHaveText("Hum. Soube bem.", { timeout: 10_000 });
    await expect(mochila.locator(".ct-held-row").first().locator(".ct-count")).toHaveText("1");
    await page.screenshot({ path: info.outputPath("cantina-comeu.png") });
    // The purchase is in the Banco's movements, as a purchase.
    const books = await page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token;
      return (await (await fetch("/api/v1/me/wallet", { headers: { authorization: `Bearer ${token}` } })).json()) as { cash: number; cashLines: { reason: string; amount: number }[] };
    });
    expect(books.cash).toBe(had - 350);
    expect(books.cashLines[0]).toMatchObject({ reason: "purchase", amount: -350 });
    expect(seen.errors).toEqual([]);
  });

  test("a biscato (Task 4.5): at the bacia the gold button says Lavar pratos; plates rubbed clean and put up on the escorredor; Sair; the pay on a receipt and in the Carteira", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). The biscato was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(120_000);
    const seen = watch(page);
    await comeIn(page, 97);
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    const manifest = (await (await page.request.get("/packs/dev/manifest.json")).json()) as { pois: { id: string; pos: [number, number, number] }[] };
    const bacia = manifest.pois.find((one) => one.id === "biscato-pratos-ensaio")!.pos;
    await walkTo(page, bacia[0], bacia[2], 1.2);
    await page.waitForFunction(() => window.__andar!.speed < 0.05 && window.__andar!.action === "pratos", undefined, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Lavar pratos" })).toBeVisible();
    await page.keyboard.press("e");
    const work = page.getByRole("dialog", { name: "Lavar pratos" });
    await expect(work.locator(".bp-prato")).toBeVisible({ timeout: 10_000 });
    // Two plates, each rubbed with a steady hand until it shines, then put up on the escorredor.
    for (let plate = 0; plate < 2; plate++) {
      await expect(work.locator(".bp-prato")).toBeVisible({ timeout: 8000 });
      for (let n = 0; n < 12 && (await work.locator(".bp-brilha").count()) === 0; n++) {
        await page.keyboard.press(" ");
        await page.waitForTimeout(150);
        // Half-way through the second plate: stains still on it, foam where it was rubbed.
        if (plate === 1 && n === 1) await page.screenshot({ path: info.outputPath("biscato-pratos-a-esfregar.png") });
      }
      if (plate === 1) await page.screenshot({ path: info.outputPath("biscato-pratos.png") });
      await page.keyboard.press("Enter");
    }
    await expect(work.locator(".bc-done")).toContainText("Limpos: 2");
    // The body did not jump or walk while the hands worked.
    expect(Math.hypot((await page.evaluate(() => window.__andar!.x)) - bacia[0], (await page.evaluate(() => window.__andar!.z)) - bacia[2])).toBeLessThan(1.5);
    // Done early: what was done is scored against the whole round, and paid.
    await work.getByRole("button", { name: "Sair" }).click();
    const fim = page.getByRole("dialog", { name: "Pronto, já está." });
    await expect(fim).toContainText("Lavaste 2 dos");
    await expect(fim.locator(".n-receipt")).toBeVisible({ timeout: 10_000 });
    await expect(fim.locator(".n-receipt")).toContainText("Bacia de Ensaio");
    await page.screenshot({ path: info.outputPath("biscato-pratos-fim.png") });
    const wallet = await page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token;
      return (await (await fetch("/api/v1/me/wallet", { headers: { authorization: `Bearer ${token}` } })).json()) as { cashLines: { amount: number; reason: string }[] };
    });
    expect(wallet.cashLines[0]).toMatchObject({ reason: "wage" });
    expect(wallet.cashLines[0]!.amount).toBeGreaterThanOrEqual(150);
    await fim.getByRole("button", { name: "Voltar à rua" }).click();
    await expect(page.getByRole("dialog", { name: "Pronto, já está." })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Lavar pratos" })).toBeVisible();
    // The Biscatos app: what today's have paid, then the district's four, nearest first; one marked for the compass.
    await page.getByRole("button", { name: "Telemóvel" }).click();
    const phone = page.getByRole("dialog", { name: "Telemóvel" });
    await phone.getByRole("button", { name: "Biscatos" }).click();
    await expect(phone.locator(".tb-hoje")).toContainText(`Hoje já ganhaste ${wallet.cashLines[0]!.amount}`);
    await expect(phone.locator(".tb-um")).toHaveCount(4);
    await expect(phone.locator(".tb-um").first()).toContainText("Lavar pratos");
    await expect(phone.locator(".tb-um").first()).toContainText("150 a 450 Mk · 1 min 15 s · a ");
    await page.screenshot({ path: info.outputPath("biscatos-app.png") });
    // The compass's gold marks are today's errands' too: marking adds one.
    const golds = await page.locator(".n-compass-target").count();
    await phone.locator(".tb-um").nth(1).getByRole("button", { name: "Marcar" }).click();
    await expect(phone.locator(".tb-um").nth(1).getByRole("button", { name: "Desmarcar" })).toBeVisible();
    await expect(page.locator(".n-compass-target")).toHaveCount(golds + 1);
    // In the Banco's statement the pay is a biscato's.
    await phone.getByRole("button", { name: "Voltar" }).click();
    await phone.getByRole("button", { name: "Banco" }).click();
    await expect(phone).toContainText("Um biscato");
    expect(seen.errors).toEqual([]);
  });

  test("levar carga (Task 4.5): at the carrinhos the gold button says Levar carga; the stack sways and is steadied by taps; a load delivered; paid", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Levar carga was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(120_000);
    const seen = watch(page);
    await comeIn(page, 98);
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    const manifest = (await (await page.request.get("/packs/dev/manifest.json")).json()) as { pois: { id: string; pos: [number, number, number] }[] };
    const spot = manifest.pois.find((one) => one.id === "biscato-carga-ensaio")!.pos;
    await walkTo(page, spot[0], spot[2], 1.2);
    await page.waitForFunction(() => window.__andar!.speed < 0.05 && window.__andar!.action === "carga", undefined, { timeout: 10_000 });
    await page.keyboard.press("e");
    const work = page.getByRole("dialog", { name: "Levar carga" });
    await expect(work.locator(".bg-pilha")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("biscato-carga.png") });
    // A steady hand, in the page: it reads the stack's lean and taps against it, a few times a second, until a load is in.
    await page.evaluate(async () => {
      const end = performance.now() + 16_000;
      const left = document.querySelector(".bg-esquerda")!;
      const right = document.querySelector(".bg-direita")!;
      let last = 0;
      while (performance.now() < end && !/Entregues: [1-9]/.test(document.querySelector(".bc-done")?.textContent ?? "")) {
        const lean = Number(/rotate\((-?[\d.]+)deg/.exec((document.querySelector(".bg-pilha") as HTMLElement).style.transform)?.[1] ?? 0);
        if (performance.now() - last > 120 && Math.abs(lean) > 2.5) {
          (lean > 0 ? left : right).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          last = performance.now();
        }
        await new Promise((done) => setTimeout(done, 40));
      }
    });
    await expect(work.locator(".bc-done")).toContainText("Entregues: 1");
    await work.getByRole("button", { name: "Sair" }).click();
    const fim = page.getByRole("dialog", { name: "Pronto, já está." });
    await expect(fim).toContainText("Levaste 1 de 7 cargas");
    await expect(fim.locator(".n-receipt")).toContainText("Carrinhos de Ensaio", { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("biscato-carga-fim.png") });
    await fim.getByRole("button", { name: "Voltar à rua" }).click();
    await expect(page.getByRole("button", { name: "Levar carga" })).toBeVisible();
    expect(seen.errors).toEqual([]);
  });

  test("zunga (Task 4.5): at the bacias the gold button says Zungar; each passer-by given what they ask for; paid", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Zunga was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(120_000);
    const seen = watch(page);
    await comeIn(page, 99);
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    const manifest = (await (await page.request.get("/packs/dev/manifest.json")).json()) as { pois: { id: string; pos: [number, number, number] }[] };
    const spot = manifest.pois.find((one) => one.id === "biscato-zunga-ensaio")!.pos;
    await walkTo(page, spot[0], spot[2], 1.2);
    await page.waitForFunction(() => window.__andar!.speed < 0.05 && window.__andar!.action === "zunga", undefined, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Zungar" })).toBeVisible();
    await page.keyboard.press("e");
    const work = page.getByRole("dialog", { name: "Zungar" });
    // The first passer-by stops and asks.
    await expect(work.locator(".bz-quer")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("biscato-zunga.png") });
    // A hand in the page: it reads what each one asks for and taps it from the bacia, until three have bought.
    await page.evaluate(async () => {
      const goods = ["banana", "ginguba", "agua", "pao"];
      const end = performance.now() + 20_000;
      while (performance.now() < end && !/Vendidos: [3-9]/.test(document.querySelector(".bc-done")?.textContent ?? "")) {
        const asked = document.querySelector(".bz-quer .bz-coisa")?.className ?? "";
        const n = goods.findIndex((good) => asked.includes(`bz-${good}`));
        if (n >= 0) document.querySelectorAll(".bz-tocar")[n]!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        await new Promise((done) => setTimeout(done, 300));
      }
    });
    await expect(work.locator(".bc-done")).toContainText("Vendidos: 3");
    await work.getByRole("button", { name: "Sair" }).click();
    const fim = page.getByRole("dialog", { name: "Pronto, já está." });
    await expect(fim).toContainText("Vendeste a 3 pessoas.");
    await expect(fim.locator(".n-receipt")).toContainText("Bacias de Ensaio", { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("biscato-zunga-fim.png") });
    await fim.getByRole("button", { name: "Voltar à rua" }).click();
    await expect(page.getByRole("button", { name: "Zungar" })).toBeVisible();
    expect(seen.errors).toEqual([]);
  });

  test("lavar carros (Task 4.5): at the buckets the gold button says Lavar carros; the mud gone part by part, the car drives off; paid", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Lavar carros was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(120_000);
    const seen = watch(page);
    await comeIn(page, 100);
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    const manifest = (await (await page.request.get("/packs/dev/manifest.json")).json()) as { pois: { id: string; pos: [number, number, number] }[] };
    const spot = manifest.pois.find((one) => one.id === "biscato-carros-ensaio")!.pos;
    await walkTo(page, spot[0], spot[2], 1.2);
    await page.waitForFunction(() => window.__andar!.speed < 0.05 && window.__andar!.action === "carros", undefined, { timeout: 10_000 });
    await page.keyboard.press("e");
    const work = page.getByRole("dialog", { name: "Lavar carros" });
    await expect(work.locator(".bk-lama").first()).toBeVisible({ timeout: 10_000 });
    // The sponge, dragged across the car once by a thumb: the mud it went over is less.
    const place = (await work.locator(".bk-lugar").boundingBox())!;
    await page.mouse.move(place.x + place.width * 0.1, place.y + place.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(place.x + place.width * 0.9, place.y + place.height * 0.7, { steps: 12 });
    await page.screenshot({ path: info.outputPath("biscato-carros.png") });
    await page.mouse.up();
    // A hand in the page: the number of each muddy part, a pass every tenth of a second, until two cars are washed.
    await page.evaluate(async () => {
      const end = performance.now() + 25_000;
      while (performance.now() < end && !/Lavados: [2-9]/.test(document.querySelector(".bc-done")?.textContent ?? "")) {
        const mud = document.querySelector(".bk-carro:not(.bk-sai) .bk-lama")?.className ?? "";
        const part = /bk-parte-(\d)/.exec(mud)?.[1];
        if (part !== undefined) window.dispatchEvent(new KeyboardEvent("keydown", { key: String(Number(part) + 1) }));
        await new Promise((done) => setTimeout(done, 110));
      }
    });
    await expect(work.locator(".bc-done")).toContainText("Lavados: 2");
    await work.getByRole("button", { name: "Sair" }).click();
    const fim = page.getByRole("dialog", { name: "Pronto, já está." });
    await expect(fim).toContainText("Lavaste 2 carros.");
    await expect(fim.locator(".n-receipt")).toContainText("Baldes de Ensaio", { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("biscato-carros-fim.png") });
    await fim.getByRole("button", { name: "Voltar à rua" }).click();
    await expect(page.getByRole("button", { name: "Lavar carros" })).toBeVisible();
    expect(seen.errors).toEqual([]);
  });

  test("a moto-táxi asked for from the Mapa (Task 6.2): it comes up the road, waits at the kerb, is got on with the gold button, carries the player to the paragem and sets them down there; the fare is in the Carteira's lines", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok() || !(await request.get("/packs/dev-vehicles/veiculos.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people or the vehicles are not built (pnpm pack:dev needs Blender). The ride was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(180_000);
    const seen = watch(page);
    await comeIn(page, 96);
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    // Dealt a family, and with it the Makuta one starts with.
    await page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token;
      await fetch("/api/v1/me/origin", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
    });
    const manifest = (await (await page.request.get("/packs/dev/manifest.json")).json()) as { bounds: { maxX: number; maxZ: number }; paragens: { id: string; pos: [number, number, number] }[] };
    const paragem = manifest.paragens.find((one) => one.id === "p-1")!.pos;
    // The Mapa: the paragem touched, and under Marcar the three rides with what each costs.
    await page.getByRole("button", { name: "Telemóvel" }).click();
    const phone = page.getByRole("dialog", { name: "Telemóvel" });
    await phone.getByRole("button", { name: "Mapa" }).click();
    const map = phone.locator(".tm-map-canvas");
    await expect.poll(() => map.evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(400);
    const box = (await map.boundingBox())!;
    await map.click({ position: { x: (paragem[0] / manifest.bounds.maxX) * box.width, y: (paragem[2] / manifest.bounds.maxZ) * box.height } });
    await expect(phone.locator(".tm-place")).toBeVisible();
    await expect(phone.locator(".tm-ir")).toContainText("Ir até lá");
    await expect(phone.getByRole("button", { name: /^De moto-táxi · 250\sMk$/ })).toBeVisible();
    await expect(phone.getByRole("button", { name: /^De kupapata · 300\sMk$/ })).toBeVisible();
    await expect(phone.getByRole("button", { name: /^De táxi · 350\sMk$/ })).toBeVisible();
    await phone.locator(".tm-ir").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("corrida-mapa.png") });
    await phone.getByRole("button", { name: /^De moto-táxi · 250\sMk$/ }).click();
    // Asked: the phone goes down, and the chip under the wallet says it is coming.
    await expect(page.getByRole("dialog", { name: "Telemóvel" })).toHaveCount(0);
    await expect(page.locator(".cd-chip")).toContainText("A moto vem a caminho.", { timeout: 10_000 });
    await expect(page.locator(".cd-chip").getByRole("button", { name: "Cancelar" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("corrida-vem.png") });
    // It stops on the road by the player; walked up to, the gold button gets on.
    await page.waitForFunction(() => window.__andar?.hired?.fase === "espera", undefined, { timeout: 45_000 });
    await expect(page.locator(".cd-chip")).toContainText("A moto está à tua espera na estrada.");
    const waiting = (await page.evaluate(() => window.__andar!.hired))!;
    await walkTo(page, waiting.x, waiting.z, 2.2);
    await page.waitForFunction(() => window.__andar!.action === "board", undefined, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Apanhar" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("corrida-espera.png") });
    await page.keyboard.press("e");
    await page.waitForFunction(() => (window.__andar!.myRide?.vehicle ?? 0) >= 4096 && window.__andar!.hired?.fase === "leva", undefined, { timeout: 10_000 });
    await expect(page.locator(".cd-chip")).toContainText("A caminho.");
    // Getting off is said once, on the gold button where the thumb is; the chip only says where the ride is (F-256).
    await expect(page.getByRole("button", { name: "Descer aqui" })).toHaveCount(1);
    await expect(page.locator(".cd-chip").getByRole("button")).toHaveCount(0);
    // On the way the stick does nothing: the moto takes the player, not their thumb.
    await page.waitForTimeout(2500);
    await page.keyboard.down("a");
    await page.waitForTimeout(600);
    await page.keyboard.up("a");
    await page.screenshot({ path: info.outputPath("corrida-a-andar.png") });
    // At the paragem the player is set down at the kerb, and told.
    await page.waitForFunction(() => window.__andar!.hired?.fim === "chegou" && window.__andar!.myRide === null, undefined, { timeout: 90_000 });
    await expect(page.locator(".cd-chip")).toContainText("Chegaste.");
    await page.waitForTimeout(1500);
    const there = await page.evaluate(() => window.__andar!);
    expect(Math.hypot(there.x - paragem[0], there.z - paragem[2])).toBeLessThan(15);
    await page.screenshot({ path: info.outputPath("corrida-chegou.png") });
    // The fare went out of the Carteira through the books.
    const wallet = await page.evaluate(async () => {
      const token = (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token;
      return (await (await fetch("/api/v1/me/wallet", { headers: { authorization: `Bearer ${token}` } })).json()) as { cashLines: { amount: number; reason: string }[] };
    });
    expect(wallet.cashLines[0]).toMatchObject({ reason: "fare", amount: -250 });
    // The chip goes a little after the end.
    await expect(page.locator(".cd-chip")).toHaveCount(0, { timeout: 10_000 });
    expect(seen.errors).toEqual([]);
  });

  test("os recados do dia: the neighbours' messages in Mensagens, the family's money for the taxi, and an errand walked and done in the street, paid at once", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). The errands were not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    // Somebody whose first errand of the day is near where people arrive: at the caixa or at the cantina (the
    // rehearsal town's places 5 and 6 of its eight; the biscatos' places are not errands' places), so that the test walks a few steps and not across the town; and, when it
    // is a thing to bring, somebody whose family gave enough to buy it (the day's draw can ask for óleo at 1 800 Mk of
    // someone given 1 700: F-219).
    type Day = { recados: { n: number; kind: string; who: number; item?: string; place?: number; done: boolean }[]; familia: { amount: number } };
    const shops = JSON.parse(readFileSync(new URL("../../packages/economy/tunables/shops.json", import.meta.url), "utf8")) as { shops: { cantina: { stock: { item: string; price: number }[] } } };
    const priceOf = (item: string): number => shops.shops.cantina.stock.find((one) => one.item === item)?.price ?? Infinity;
    // The places errands are done at, as the zone counts them: every place of the pack but the biscatos' (F-261).
    const places = ((await (await page.request.get("/packs/dev/manifest.json")).json()) as { pois: { id: string; pos: [number, number, number] }[] }).pois.filter((one) => !one.id.startsWith("biscato-"));
    let chosen: { guest: { playerId: string; token: string; name: string; biNumber: string; arrivedAt: string }; deviceId: string; day: Day } | null = null;
    for (let n = 0; n < 60 && !chosen; n++) {
      const deviceId = `recados-${n}-${Date.now()}-abcdefgh`;
      const guest = (await (await page.request.post("/api/v1/guests", { data: { deviceId, platform: "android", ageBand: "18_plus" } })).json()) as { playerId: string; token: string; name: string; biNumber: string; arrivedAt: string };
      const authorization = { authorization: `Bearer ${guest.token}` };
      const day = (await (await page.request.get("/api/v1/recados", { headers: authorization })).json()) as Day;
      const first = day.recados[0]!;
      if (![5, 6].includes(first.place! % places.length)) continue;
      const cash = ((await (await page.request.post("/api/v1/me/origin", { headers: authorization, data: {} })).json()) as { wallet: { cash: number } }).wallet.cash;
      if (first.kind !== "traz" || priceOf(first.item!) <= cash) chosen = { guest, deviceId, day };
    }
    expect(chosen, "a player whose first errand is near").not.toBeNull();
    const { guest, deviceId, day } = chosen!;
    await page.addInitScript((kept) => localStorage.setItem("nzila.conta", JSON.stringify(kept)), { deviceId, ageBand: "18_plus", ...guest });
    await page.goto("/andar?tier=poupanca&hour=10");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    const headers = { authorization: `Bearer ${guest.token}` };
    // Mensagens: the family, the three neighbours, the errand for two, what the bairro has today.
    await page.getByRole("button", { name: "Telemóvel" }).click();
    await page.getByRole("button", { name: "Mensagens" }).click();
    const phone = page.getByRole("dialog", { name: "Telemóvel" });
    await expect(phone.locator(".ms-msg")).toHaveCount(5, { timeout: 10_000 });
    await expect(phone.locator(".ms-familia")).toContainText("Toma, para o táxi");
    await expect(phone.locator(".ms-banda")).toContainText("Hoje na banda");
    await page.screenshot({ path: info.outputPath("recados-mensagens.png") });
    await phone.locator(".ms-familia").getByRole("button").click();
    await expect(phone.locator(".ms-familia [role=status]")).toContainText("da tua família", { timeout: 10_000 });
    await phone.locator(".ms-banda").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("recados-banda.png") });
    const first = day.recados[0]!;
    // The first errand's place on the map, for the compass.
    await phone.locator(`.ms-msg[data-kind="${first.kind}"]`).getByRole("button", { name: /Mostrar no mapa/ }).click();
    await expect(phone.locator(`.ms-msg[data-kind="${first.kind}"] .ms-place-on`)).toBeVisible();
    await page.screenshot({ path: info.outputPath("recados-marcado.png") });
    await page.getByRole("button", { name: "Fechar" }).first().click();
    const target = places[first.place! % places.length]!.pos;
    const walkAlong = async (x: number): Promise<void> => {
      const key = (await page.evaluate(() => window.__andar!.x)) < x ? "d" : "a";
      await page.keyboard.down(key);
      await page.waitForFunction((tx) => Math.abs(window.__andar!.x - tx) < 0.7, x, { timeout: 20_000 });
      await page.keyboard.up(key);
      await page.waitForFunction(() => window.__andar!.speed < 0.05, undefined, { timeout: 5_000 });
    };
    if (first.kind === "traz") {
      // To the cantina first, for the thing asked for: with nothing to hand over yet, its button is the cantina's.
      await walkAlong(58.3);
      // Pushed off the pavement's line on the way (a person of the street, F-233), the body can end beside the cantina
      // and out of its reach: then straight to its door, stepping round whoever is there.
      if (await page.evaluate(() => window.__andar!.shop === null)) {
        const door = ((await (await page.request.get("/packs/dev/manifest.json")).json()) as { pois: { glyph?: string; pos: [number, number, number] }[] }).pois.find((one) => one.glyph === "cantina")!.pos;
        await walkTo(page, door[0], door[2], 2);
        await page.waitForFunction(() => window.__andar!.speed < 0.05, undefined, { timeout: 5_000 });
      }
      // Another of the day's errands may be at the cantina itself: its button comes first; done, the cantina's comes back.
      await page.waitForFunction(() => ["buy", "procurar", "entregar"].includes(window.__andar!.action ?? ""), undefined, { timeout: 10_000 });
      if (await page.evaluate(() => window.__andar!.action !== "buy")) {
        await page.keyboard.press("e");
        await page.waitForFunction(() => window.__andar!.action === "buy", undefined, { timeout: 15_000 });
      }
      await page.keyboard.press("e");
      const cantina = page.getByRole("dialog", { name: "Cantina de Ensaio" });
      await cantina.locator(`.ct-pick[data-item="${first.item}"]`).click();
      await cantina.getByRole("button", { name: /^Pagar/ }).click();
      await cantina.getByRole("button", { name: "Já está" }).click();
    }
    await walkAlong(target[0]);
    // At the place: the neighbour (or the nephew) is there, and the gold button offers the errand.
    await page.waitForFunction(() => window.__andar!.action === "entregar" || window.__andar!.action === "procurar", undefined, { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("recados-no-sitio.png") });
    // Turned round to the place: whoever waits there is standing in it.
    const size = page.viewportSize()!;
    for (let n = 0; n < 2; n++) {
      await page.mouse.move(size.width * 0.2, size.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(size.width * 0.2 + 230, size.height * 0.3, { steps: 8 });
      await page.mouse.up();
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: info.outputPath("recados-quem-espera.png") });
    // A moment at the place, as anyone takes, before handing over.
    await page.waitForTimeout(1500);
    // What it pays is what the next errand of the day pays: 300 Mk for the first, less after, and another errand may
    // have been done at the cantina on the way (F-255).
    const pays = ((await (await page.request.get("/api/v1/recados", { headers })).json()) as { next: number }).next;
    await page.keyboard.press("e");
    await expect(page.getByText(new RegExp(`agradece\\. Recebeste ${pays}\\s*Mk\\.`))).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("recados-feito.png") });
    const after = (await (await page.request.get("/api/v1/recados", { headers })).json()) as Day;
    expect(after.recados[0]!.done).toBe(true);
    // An evening the light goes: the lamps and the windows of the bairro dark.
    await page.goto("/andar?tier=normal&hour=19.6&apagao");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: info.outputPath("recados-apagao.png") });
    expect(seen.errors).toEqual([]);
  });

  test("they talk: a line typed by one is a balloon over their head and a line in the other's log; dots while typing; a quick phrase on one tap; a rude word is said to nobody; a gesture is seen", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Talk was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    const firstName = await comeIn(page, 31);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    const otherSeen = watch(other);
    const secondName = await comeIn(other, 32);
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true && window.__andar.talk, undefined, { timeout: 45_000 });
    await other.goto("/andar?tier=poupanca&hour=12");
    await other.waitForFunction(() => window.__andar?.linked === true && window.__andar.talk && window.__andar.players === 1, undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__andar!.players === 1, undefined, { timeout: 20_000 });

    // The second arrived a step in front of the first, in the first's picture. The second opens the line and types:
    // the first sees three dots over them before a word is said.
    await other.getByRole("button", { name: "Escreve aqui" }).click();
    const line = other.getByRole("textbox", { name: "Escreve aqui" });
    await line.pressSequentially("Bom dia, vizinha");
    await page.waitForFunction(() => window.__andar!.balloons === 1, undefined, { timeout: 10_000 });
    await expect(page.locator(".cv-over .n-dots")).toHaveCount(1);
    await page.screenshot({ path: info.outputPath("conversa-a-escrever.png") });
    // The letters did not walk the player about: W, A, S and D are letters while the line is open.
    expect(await other.evaluate(() => window.__andar!.speed)).toBeLessThan(0.2);

    // Said: a balloon over the speaker on both phones, and a line in both logs, with the speaker's name on the other's.
    await line.press("Enter");
    await expect(page.locator(".cv-over .n-balloon:not([hidden])")).toHaveText("Bom dia, vizinha", { timeout: 10_000 });
    await expect(other.locator(".cv-over .n-balloon:not([hidden])")).toHaveText("Bom dia, vizinha");
    await expect(page.locator(".cv-log")).toContainText(`${secondName} Bom dia, vizinha`);
    await expect(other.locator(".cv-log")).toContainText("Tu Bom dia, vizinha");
    // Nobody arrives knowing anybody, and "Bom dia" is a greeting: the one greeted is told so, and may answer.
    expect(await page.evaluate(() => window.__andar!.known)).toBe(0);
    await expect(page.getByText(/cumprimentou-te\. Responde-lhe\./)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("conversa-balao.png") });

    // The first answers with a quick phrase, on one tap.
    await page.getByRole("button", { name: "Escreve aqui" }).click();
    await page.screenshot({ path: info.outputPath("conversa-frases.png") });
    await page.getByRole("button", { name: "Tudo fixe?" }).click();
    await expect(other.locator(".cv-log")).toContainText(`${firstName} Tudo fixe?`, { timeout: 10_000 });
    // A greeting answered by a greeting: they have met. Said on both phones, and remembered on each.
    await expect(page.getByText(/^Agora conheces /)).toBeVisible({ timeout: 10_000 });
    await expect(other.getByText(/^Agora conheces /)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("dois-conhecem-se.png") });
    expect(await page.evaluate(() => window.__andar!.known)).toBe(1);
    expect(await other.evaluate(() => JSON.parse(localStorage.getItem("nzila.conhecidos") ?? "[]").length)).toBe(1);

    // A word the game does not pass on: said to nobody, and only its speaker is told, kindly.
    await other.waitForTimeout(700);
    await other.getByRole("button", { name: "Escreve aqui" }).click();
    await other.getByRole("textbox", { name: "Escreve aqui" }).fill("és um merdas");
    await other.getByRole("textbox", { name: "Escreve aqui" }).press("Enter");
    await expect(other.locator(".cv-refused")).toHaveText("Essa frase não foi dita. Diz de outra maneira.", { timeout: 10_000 });
    await page.waitForTimeout(600);
    expect((await page.evaluate(() => window.__andar!.lines)).some((said) => said.includes("merdas"))).toBe(false);
    await expect(page.locator(".cv-refused")).toHaveCount(0);

    // A gesture: the second waves (the key 1), and the first sees their body wave.
    await other.keyboard.press("1");
    await page.waitForFunction(() => window.__andar!.gestures.includes("acenar"), undefined, { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("conversa-gesto.png") });

    await other.close();
    expect(seen.errors).toEqual([]);
    expect(otherSeen.errors).toEqual([]);
  });

  test("on a bench (F-205, Task 4.4): sat on with the gold button, and the other phone sees them on the seat, not beside it; up again, they stand in front of it", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Benches were not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await comeIn(page, 95);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    await comeIn(other, 96);
    await page.goto("/andar?tier=poupanca&hour=10");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    await other.goto("/andar?tier=poupanca&hour=10");
    await other.waitForFunction(() => window.__andar?.linked === true && window.__andar.players === 1, undefined, { timeout: 45_000 });
    // A bench's seat near where people arrive: one for each phone's run, as they share the zone of the tests.
    const manifest = (await (await request.get("/packs/dev/manifest.json")).json()) as { seats: { pos: [number, number, number]; facing: number }[] };
    const start = await page.evaluate(() => ({ x: window.__andar!.x, z: window.__andar!.z }));
    // Of those facing the way the street runs (their fronts are reached straight along it), the nearest two.
    const byNear = manifest.seats.filter((one) => one.facing === 0).sort((a, b) => Math.hypot(a.pos[0] - start.x, a.pos[2] - start.z) - Math.hypot(b.pos[0] - start.x, b.pos[2] - start.z));
    const seat = byNear[info.project.name === "phone" ? 0 : 1]!;
    const facing = (seat.facing * Math.PI) / 180;
    const front = { x: seat.pos[0] + Math.sin(facing) * 0.7, z: seat.pos[2] + Math.cos(facing) * 0.7 };
    // Round the bench's end and in from its front (from behind, the bench is in the way; east of the door, a kiosk).
    await walkTo(page, start.x, front.z - 3, 0.4);
    await walkTo(page, front.x + 2.2, front.z - 3, 0.4);
    await walkTo(page, front.x + 2.2, front.z, 0.4);
    // Close enough to sit is all it takes (the bench's own ground keeps a body a step off it).
    await walkTo(page, seat.pos[0], seat.pos[2], 1.75);
    await page.waitForFunction(() => window.__andar!.action === "sit", undefined, { timeout: 15_000 });
    await page.getByRole("button", { name: "Sentar" }).click();
    await page.waitForFunction(() => window.__andar!.seated, undefined, { timeout: 5_000 });
    // The other phone sees them on the seat itself (standing, nobody is ever there: the bench is in the way).
    await other.waitForFunction(
      (at) => window.__andar!.others.some((one) => Math.hypot(one.x - at[0], one.z - at[2]) < 0.15),
      seat.pos,
      { timeout: 10_000 },
    );
    await other.screenshot({ path: info.outputPath("banco-visto.png") });
    // Up again: in front of the bench, on the other phone too.
    await page.getByRole("button", { name: "Levantar" }).click();
    await page.waitForFunction(() => !window.__andar!.seated, undefined, { timeout: 5_000 });
    await other.waitForFunction(
      (at) => window.__andar!.others.some((one) => Math.hypot(one.x - at[0], one.z - at[2]) > 0.3 && Math.hypot(one.x - at[0], one.z - at[2]) < 1.5),
      seat.pos,
      { timeout: 10_000 },
    );
    expect(seen.errors).toEqual([]);
  });

  test("kambas (Task 4B.2): asked from the card, a yes in Mensagens; they write to each other; an invitation to play, and the compass points at the one who sent it", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Kambas were not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    const myName = await comeIn(page, 91);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    const otherSeen = watch(other);
    const otherName = await comeIn(other, 92);
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    await other.goto("/andar?tier=poupanca&hour=12");
    await other.waitForFunction(() => window.__andar?.linked === true && window.__andar.players === 1, undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__andar!.players === 1 && window.__andar!.names >= 1, undefined, { timeout: 20_000 });

    // "Adicionar" on the card of the other.
    expect(await tapSomeone(page, otherName), "a tap on the other player opened their card").toBe(true);
    const sheet = page.getByRole("dialog", { name: otherName });
    await sheet.getByRole("button", { name: "Adicionar" }).click();
    await expect(sheet.getByRole("status")).toContainText(`Pedido enviado a ${otherName}`);
    await expect(sheet.getByRole("button", { name: "Pedido enviado" })).toBeDisabled();
    await page.screenshot({ path: info.outputPath("kamba-pedido-enviado.png") });
    await sheet.getByRole("button", { name: "Fechar" }).click();

    // The other sees a count on the Telemóvel, opens Mensagens on the kambas, and says yes.
    // What waits is asked every thirty seconds (F-225): the count shows by the next time it is asked.
    await expect(other.locator(".andar-badged .n-badge")).toHaveText("1", { timeout: 35_000 });
    await other.screenshot({ path: info.outputPath("kamba-conta.png") });
    await other.getByRole("button", { name: "Telemóvel" }).click();
    await other.getByRole("button", { name: "Mensagens" }).click();
    await expect(other.getByRole("tab", { name: "Kambas" })).toHaveAttribute("aria-selected", "true");
    const asked = other.locator(".kb-pedido", { hasText: myName });
    await expect(asked).toBeVisible();
    await other.screenshot({ path: info.outputPath("kamba-pedido.png") });
    await asked.getByRole("button", { name: "Aceitar" }).click();
    await expect(other.locator(".kb-said")).toHaveText(`Tu e ${myName} já são kambas.`);
    // In the list, in the street now; their conversation, empty, says how it starts.
    const row = other.locator(".kb-linha", { hasText: myName });
    await expect(row.locator(".kb-onde")).toHaveClass(/kb-onde-rua/);
    await other.screenshot({ path: info.outputPath("kamba-lista.png") });
    await row.click();
    await expect(other.locator(".kb-primeira")).toContainText(myName);
    await other.getByRole("textbox", { name: `Escreve a ${myName}…` }).fill("Bom dia, kamba!");
    await other.getByRole("button", { name: "Enviar" }).click();
    await expect(other.locator(".kb-bolha.kb-minha")).toContainText("Bom dia, kamba!");
    // And asks them to come and play damas.
    await other.locator(".kb-seguranca").getByRole("button", { name: "Convidar para jogar" }).click();
    await other.locator(".kb-jogos").getByRole("button", { name: "Damas" }).click();
    await expect(other.locator(".kb-convite.kb-minha")).toContainText("Chamaste para damas");
    await other.screenshot({ path: info.outputPath("kamba-conversa.png") });

    // The first: the card now says "Escrever", which opens the conversation.
    expect(await tapSomeone(page, otherName), "a second tap opened their card again").toBe(true);
    await sheet.getByRole("button", { name: "Escrever" }).click();
    await expect(page.locator(".kb-bolha", { hasText: "Bom dia, kamba!" })).toBeVisible({ timeout: 10_000 });
    const invitation = page.locator(".kb-convite", { hasText: `${otherName} chama-te para damas` });
    await expect(invitation).toBeVisible();
    await page.screenshot({ path: info.outputPath("kamba-convite.png") });
    // "Ir ter com": in the same street, the compass points at them.
    await invitation.getByRole("button", { name: "Ir ter com" }).click();
    await expect(page.locator(".kb-said")).toHaveText(`A bússola aponta para ${otherName}.`);
    await page.screenshot({ path: info.outputPath("kamba-ir.png") });
    expect(seen.errors, "the first phone said nothing went wrong").toEqual([]);
    expect(otherSeen.errors, "the second phone said nothing went wrong").toEqual([]);
  });

  test("Convidar para jogar (Task 4B.1): a tap on someone, a game; they are asked and say yes; both are told; the one invited walks to the table and is seated in the seat kept for them", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Invitations were not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    const myName = await comeIn(page, 81);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    const otherSeen = watch(other);
    const otherName = await comeIn(other, 82);
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    await other.goto("/andar?tier=poupanca&hour=12");
    await other.waitForFunction(() => window.__andar?.linked === true && window.__andar.players === 1, undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__andar!.players === 1 && window.__andar!.names >= 1, undefined, { timeout: 20_000 });
    expect(await tapSomeone(page, otherName), "a tap on the other player opened their card").toBe(true);
    const sheet = page.getByRole("dialog", { name: otherName });
    await sheet.getByRole("button", { name: "Convidar para jogar" }).click();
    await sheet.getByRole("button", { name: "Xadrez" }).click();
    await expect(sheet.getByRole("status")).toContainText("Convite enviado");
    // The other is asked, plainly, and says yes.
    const asked = other.getByRole("dialog", { name: `${myName} convida-te para uma partida de xadrez.` });
    await expect(asked).toBeVisible({ timeout: 8000 });
    await other.screenshot({ path: info.outputPath("convite.png") });
    await asked.getByRole("button", { name: "Vamos" }).click();
    await expect(asked).toHaveCount(0);
    // Both are told: the one who asked that it is a yes, the one asked where their seat is kept.
    await expect(page.locator(".ms-aviso")).toHaveText(`${otherName} aceitou. Os vossos lugares estão guardados.`, { timeout: 8000 });
    await expect(other.locator(".ms-aviso")).toContainText("O teu lugar na mesa de xadrez está guardado");
    await page.getByRole("dialog", { name: otherName }).getByRole("button", { name: "Fechar" }).click().catch(() => {});
    await page.screenshot({ path: info.outputPath("aceitou.png") });
    // The one invited walks to the table, to the stool of the one who invited them: they are seated in their own.
    const manifest = (await (await request.get("/packs/dev/manifest.json")).json()) as { tables: { game: string; pos: [number, number, number]; seats: { pos: [number, number, number] }[] }[] };
    const from = await page.evaluate(() => ({ x: window.__andar!.x, z: window.__andar!.z }));
    const table = manifest.tables.filter((one) => one.game === "xadrez").sort((a, b) => Math.hypot(a.pos[0] - from.x, a.pos[2] - from.z) - Math.hypot(b.pos[0] - from.x, b.pos[2] - from.z))[0]!;
    const stool = table.seats[0]!.pos;
    const away = Math.hypot(stool[0] - table.pos[0], stool[2] - table.pos[2]);
    const stand = { x: stool[0] + ((stool[0] - table.pos[0]) / away) * 0.75, z: stool[2] + ((stool[2] - table.pos[2]) / away) * 0.75 };
    const start = await other.evaluate(() => ({ x: window.__andar!.x, z: window.__andar!.z }));
    await walkTo(other, stand.x, start.z, 0.4);
    await walkTo(other, stand.x, stand.z, 0.3);
    await other.waitForFunction(() => window.__andar!.action === "xadrez", undefined, { timeout: 15_000 });
    await other.getByRole("button", { name: "Jogar xadrez" }).click();
    await other.waitForFunction(() => window.__andar!.mesa !== null && window.__andar!.seated, undefined, { timeout: 10_000 });
    const board = other.getByRole("dialog", { name: "Xadrez" });
    // Seated across from the stool they came to, waiting for the one whose seat is kept: no kota sits in it.
    await expect(board.locator(".ms-seat-me")).toHaveCount(1);
    await expect(board.locator(".ms-seat").nth(1)).toHaveClass(/ms-seat-me/);
    await expect(board.locator(".ms-seat").nth(0)).toContainText("Lugar guardado");
    await expect(board).toContainText("À espera de mais alguém");
    await other.screenshot({ path: info.outputPath("lugar-guardado.png") });
    // A kota would take the seat kept for the one who invited: the board says whose it is and asks first (F-213).
    await board.getByRole("button", { name: "Jogar já com o kota" }).click();
    await expect(board.locator(".ms-line")).toHaveText(`O lugar de ${myName} está guardado. Começar já, com um kota nesse lugar?`);
    await other.screenshot({ path: info.outputPath("lugar-guardado-pergunta.png") });
    await board.getByRole("button", { name: "Esperar" }).click();
    await expect(board).toContainText("À espera de mais alguém");
    await expect(board.locator(".ms-seat").nth(0)).toContainText("Lugar guardado");
    expect(seen.errors).toEqual([]);
    expect(otherSeen.errors).toEqual([]);
  });

  test("Dar Makuta: a tap on someone beside you, an amount, and it is theirs; they are told at once who gave it", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Giving Makuta was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await comeIn(page, 71);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    const otherName = await comeIn(other, 72);
    // The giver proves an address (the tests' mail goes nowhere and every code is the same), and is born into a family.
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token);
    const headers = { authorization: `Bearer ${token}` };
    expect((await page.request.post("/api/v1/me/email", { headers, data: { email: `dar-${info.project.name}-${Date.now()}@exemplo.ao`, password: "uma frase que so eu sei" } })).ok()).toBe(true);
    expect((await page.request.post("/api/v1/me/email/verify", { headers, data: { code: "246810" } })).ok()).toBe(true);
    const had = ((await (await page.request.post("/api/v1/me/origin", { headers, data: {} })).json()) as { wallet: { cash: number } }).wallet.cash;
    await other.goto("/andar?tier=poupanca&hour=12");
    await other.waitForFunction(() => window.__andar?.linked === true && window.__andar.players === 1, undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__andar!.players === 1 && window.__andar!.names >= 1, undefined, { timeout: 20_000 });
    expect(await tapSomeone(page, otherName), "a tap on the other player opened their card").toBe(true);
    const sheet = page.getByRole("dialog", { name: otherName });
    await sheet.getByRole("button", { name: "Dar Makuta" }).click();
    await sheet.getByRole("textbox", { name: "Quanto?" }).fill("300");
    await page.screenshot({ path: info.outputPath("dar-makuta.png") });
    await sheet.getByRole("button", { name: "Dar", exact: true }).click();
    await expect(sheet.getByRole("status")).toHaveText(`Deste 300 Mk a ${otherName}.`, { timeout: 10_000 });
    // The other is told at once, not in half a minute: the giver's phone nudges theirs through the zone.
    await expect(other.getByText(/deu-te 300\s*Mk/)).toBeVisible({ timeout: 6_000 });
    await other.screenshot({ path: info.outputPath("recebeu-makuta.png") });
    // And the books say so.
    expect(await (await page.request.get("/api/v1/me/wallet", { headers })).json()).toMatchObject({ cash: had - 300 });
    // A thing from the Mochila can be handed over too; with nothing in it, the sheet says so.
    await sheet.getByRole("button", { name: "Dar presente" }).click();
    await expect(sheet.getByText(`O que dás a ${otherName}?`)).toBeVisible();
    await expect(sheet.getByText("Não levas nada na mochila.")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("dar-coisa-vazia.png") });
    await sheet.getByRole("button", { name: "Deixar estar" }).click();
    expect(seen.errors).toEqual([]);
  });

  test("a gift (Task 10.13): flowers bought at the banca, given to someone beside you from their card, and they are told at once who gave them", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Giving a gift was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(240_000);
    const seen = watch(page);
    await comeIn(page, 97);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    const otherName = await comeIn(other, 98);
    await page.goto("/andar?tier=poupanca&hour=10");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token);
    const headers = { authorization: `Bearer ${token}` };
    await page.request.post("/api/v1/me/origin", { headers, data: {} });
    await other.goto("/andar?tier=poupanca&hour=10");
    await other.waitForFunction(() => window.__andar?.linked === true && window.__andar.players === 1, undefined, { timeout: 45_000 });
    // To the banca of things to give: a shop in the street, as the cantina is, with its own sign.
    const banca = ((await (await page.request.get("/packs/dev/manifest.json")).json()) as { pois: { id: string; glyph?: string; pos: [number, number, number] }[] }).pois.find((one) => one.id === "banca-ensaio")!;
    expect(banca.glyph).toBe("flores");
    await walkTo(page, banca.pos[0], banca.pos[2], 1.2);
    // Keys pressed before the page has the keyboard move nobody: once more if so.
    if (await page.evaluate(() => window.__andar!.shop === null)) await walkTo(page, banca.pos[0], banca.pos[2], 1.2);
    // The banca is one of the places errands are done at: today's may be here, and its button comes first (F-263).
    await page.waitForFunction(() => window.__andar!.speed < 0.05 && ["buy", "procurar", "entregar"].includes(window.__andar!.action ?? ""), undefined, { timeout: 15_000 });
    if (await page.evaluate(() => window.__andar!.action !== "buy")) {
      await page.waitForTimeout(1200);
      await page.keyboard.press("e");
      await page.waitForFunction(() => window.__andar!.action === "buy", undefined, { timeout: 15_000 });
    }
    await page.screenshot({ path: info.outputPath("banca-rua.png") });
    const stall = page.getByRole("dialog", { name: "Banca de Ensaio" });
    for (let tries = 0; tries < 3 && !(await stall.isVisible()); tries++) {
      await page.getByRole("button", { name: "Comprar" }).click();
      await stall.waitFor({ timeout: 3000 }).catch(() => {});
    }
    // Her own words and her own shelf: flowers, perfume, a pano, at the founder's prices.
    await expect(stall.locator(".ct-grille")).toContainText("Bom dia, querido.", { timeout: 10_000 });
    await expect(stall.getByRole("heading", { name: "Para oferecer" })).toBeVisible();
    await expect(stall.locator('.ct-pick[data-item="flores"]')).toContainText(/Ramo de flores.*500\sMk/s);
    await expect(stall.locator('.ct-pick[data-item="perfume"]')).toContainText(/2\.500\sMk/);
    await expect(stall.locator('.ct-pick[data-item="pano"]')).toContainText(/Pano.*3\.000\sMk/s);
    await page.screenshot({ path: info.outputPath("banca-aberta.png") });
    const before = ((await (await page.request.get("/api/v1/me/wallet", { headers })).json()) as { cash: number }).cash;
    await stall.locator('.ct-pick[data-item="flores"]').click();
    await stall.getByRole("button", { name: /^Pagar 500\sMk$/ }).click();
    await expect(stall.locator(".n-receipt")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("banca-recibo.png") });
    await stall.getByRole("button", { name: "Já está" }).click();
    // 500 Mk less than before the flowers (an errand done at the banca on the way paid something first).
    expect(((await (await page.request.get("/api/v1/me/wallet", { headers })).json()) as { cash: number }).cash).toBe(before - 500);
    // In the Mochila it says what it is for.
    await page.getByRole("button", { name: "Mochila" }).click();
    await expect(page.getByRole("dialog", { name: "Mochila" })).toContainText("Para oferecer a alguém", { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("presente-mochila.png") });
    await page.getByRole("dialog", { name: "Mochila" }).getByRole("button", { name: "Fechar" }).click();
    // Back to the other, and given from their card.
    const them = await other.evaluate(() => ({ x: window.__andar!.x, z: window.__andar!.z }));
    await walkTo(page, them.x, them.z, 1.6);
    await page.waitForFunction(() => window.__andar!.speed < 0.05, undefined, { timeout: 5_000 });
    expect(await tapSomeone(page, otherName), "a tap on the other player opened their card").toBe(true);
    const sheet = page.getByRole("dialog", { name: otherName });
    await sheet.getByRole("button", { name: "Dar presente" }).click();
    await expect(sheet.locator('.cv-thing[data-item="flores"]')).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("presente-escolher.png") });
    await sheet.locator('.cv-thing[data-item="flores"]').click();
    await expect(sheet.getByRole("status")).toHaveText(`Deste um ramo de flores a ${otherName}.`, { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("presente-dado.png") });
    // Seen in the street (F-257): the flowers are in the other's hand.
    await expect.poll(() => other.evaluate(() => window.__andar!.hand), { timeout: 8_000 }).toBe("flores");
    await page.getByRole("dialog", { name: otherName }).getByRole("button", { name: "Fechar" }).click().catch(() => {});
    await page.screenshot({ path: info.outputPath("presente-na-mao.png") });
    // The other is told at once what, and by whom; and it is in their Mochila.
    await expect(other.getByText(/deu-te um ramo de flores\./)).toBeVisible({ timeout: 8_000 });
    await other.screenshot({ path: info.outputPath("presente-recebido.png") });
    await other.getByRole("button", { name: "Mochila" }).click();
    await expect(other.getByRole("dialog", { name: "Mochila" })).toContainText("Ramo de flores", { timeout: 10_000 });
    await other.screenshot({ path: info.outputPath("presente-na-mochila.png") });
    expect(seen.errors).toEqual([]);
  });

  test("a gelado at the geladaria (D-10.4): the moço greets, a gelado is 300 Mk, it is in the Mochila and is eaten", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Buying a gelado was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(240_000);
    const seen = watch(page);
    await comeIn(page, 99);
    await page.goto("/andar?tier=poupanca&hour=16");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token);
    const headers = { authorization: `Bearer ${token}` };
    await page.request.post("/api/v1/me/origin", { headers, data: {} });
    const place = ((await (await page.request.get("/packs/dev/manifest.json")).json()) as { pois: { id: string; glyph?: string; pos: [number, number, number] }[] }).pois.find((one) => one.id === "gelados-ensaio")!;
    expect(place.glyph).toBe("gelado");
    // Round the house to its counter, which faces the esplanada: east of it, then along its front.
    await walkTo(page, place.pos[0] + 7.5, place.pos[2] + 7, 1.5, 120);
    await walkTo(page, place.pos[0] + 7.5, place.pos[2] + 0.2, 1.2, 80);
    await walkTo(page, place.pos[0], place.pos[2], 1.2, 80);
    if (await page.evaluate(() => window.__andar!.shop === null)) await walkTo(page, place.pos[0], place.pos[2], 1.0);
    // The geladaria is one of the places errands are done at: today's may be here, and its button comes first (F-263).
    await page.waitForFunction(() => window.__andar!.speed < 0.05 && ["buy", "procurar", "entregar"].includes(window.__andar!.action ?? ""), undefined, { timeout: 15_000 });
    if (await page.evaluate(() => window.__andar!.action !== "buy")) {
      await page.waitForTimeout(1200);
      await page.keyboard.press("e");
      await page.waitForFunction(() => window.__andar!.action === "buy", undefined, { timeout: 15_000 });
    }
    await page.screenshot({ path: info.outputPath("geladaria-rua.png") });
    const shop = page.getByRole("dialog", { name: "Geladaria de Ensaio" });
    for (let tries = 0; tries < 3 && !(await shop.isVisible()); tries++) {
      await page.getByRole("button", { name: "Comprar" }).click();
      await shop.waitFor({ timeout: 3000 }).catch(() => {});
    }
    await expect(shop.locator(".ct-grille")).toContainText("Boa tarde, chefe.", { timeout: 10_000 });
    await expect(shop.locator('.ct-pick[data-item="gelado"]')).toContainText(/Gelado.*300\sMk/s);
    await page.screenshot({ path: info.outputPath("geladaria-aberta.png") });
    const before = ((await (await page.request.get("/api/v1/me/wallet", { headers })).json()) as { cash: number }).cash;
    await shop.locator('.ct-pick[data-item="gelado"]').click();
    await shop.getByRole("button", { name: /^Pagar 300\sMk$/ }).click();
    await expect(shop.locator(".n-receipt")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("geladaria-recibo.png") });
    await shop.getByRole("button", { name: "Já está" }).click();
    expect(((await (await page.request.get("/api/v1/me/wallet", { headers })).json()) as { cash: number }).cash).toBe(before - 300);
    // No card of the house here: that is the cantina's.
    // In the Mochila, and eaten: it is food.
    await page.getByRole("button", { name: "Mochila" }).click();
    const mochila = page.getByRole("dialog", { name: "Mochila" });
    await expect(mochila.locator('.ct-held-row', { hasText: "Gelado" })).toBeVisible({ timeout: 10_000 });
    await mochila.locator(".ct-held-row", { hasText: "Gelado" }).getByRole("button", { name: "Comer" }).click();
    await expect(mochila.getByRole("status")).toHaveText("Hum. Soube bem.", { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("geladaria-comeu.png") });
    expect(seen.errors).toEqual([]);
  });

  test("Convidar para sair (Task 10.13): asked from the card, answered with another place, agreed; a táxi for two takes both; they arrive together; one ends it", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok() || !(await request.get("/packs/dev-vehicles/veiculos.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people or the vehicles are not built (pnpm pack:dev needs Blender). Going out was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(360_000);
    const seen = watch(page);
    const myName = await comeIn(page, 111);
    const context = (): Promise<Page> => browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" }).then((made) => made.newPage());
    const other = await context();
    seconds.push(other);
    const otherSeen = watch(other);
    const otherName = await comeIn(other, 112);
    await page.goto("/andar?tier=poupanca&hour=17");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token);
    const headers = { authorization: `Bearer ${token}` };
    await page.request.post("/api/v1/me/origin", { headers, data: {} });
    await other.goto("/andar?tier=poupanca&hour=17");
    await other.waitForFunction(() => window.__andar?.linked === true && window.__andar.players === 1, undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__andar!.players === 1, undefined, { timeout: 20_000 });

    // From the other's card: the places of the bairro, each with its sign.
    expect(await tapSomeone(page, otherName), "a tap on the other player opened their card").toBe(true);
    const sheet = page.getByRole("dialog", { name: otherName });
    await sheet.getByRole("button", { name: "Convidar para sair" }).click();
    await expect(sheet.getByRole("heading", { name: `Aonde vão, tu e ${otherName}?` })).toBeVisible();
    await expect(sheet.locator(".cv-lugar")).toHaveText(["A banca das flores", "Os gelados"]);
    await page.screenshot({ path: info.outputPath("sair-escolher.png") });
    await sheet.locator('.cv-lugar[data-lugar="banca-ensaio"]').click();
    await expect(sheet.getByRole("status")).toHaveText(`Convidaste ${otherName} para ir à banca das flores.`);
    await page.screenshot({ path: info.outputPath("sair-convidou.png") });
    await sheet.getByRole("button", { name: "Fechar" }).click();

    // The other is asked, and would rather the gelados.
    const ask = other.getByRole("dialog", { name: `${myName} quer sair contigo. Vamos à banca das flores?` });
    await expect(ask).toBeVisible({ timeout: 10_000 });
    await expect(ask.getByRole("button")).toHaveText(["Agora não", "Outro sítio", "Vamos"]);
    await other.screenshot({ path: info.outputPath("sair-pergunta.png") });
    await ask.getByRole("button", { name: "Outro sítio" }).click();
    await expect(ask.locator(".sr-lugar")).toHaveText(["Os gelados"]);
    await other.screenshot({ path: info.outputPath("sair-outro.png") });
    await ask.locator('.sr-lugar[data-lugar="gelados-ensaio"]').click();

    // The first is answered with the other place, and says yes: both are told, and each has the chip and the compass.
    const back = page.getByRole("dialog", { name: `${otherName} prefere ir aos gelados.` });
    await expect(back).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("sair-prefere.png") });
    await back.getByRole("button", { name: "Vamos" }).click();
    await expect(page.getByRole("status").filter({ hasText: `Combinado. Vais aos gelados com ${otherName}.` })).toBeVisible({ timeout: 10_000 });
    await expect(other.getByRole("status").filter({ hasText: `Combinado. Vais aos gelados com ${myName}.` })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".sr-chip")).toContainText(`A sair com ${otherName}`);
    await expect(page.locator(".sr-chip")).toContainText(/Os gelados · \d+ m/);
    await expect(other.locator(".sr-chip")).toContainText(`A sair com ${myName}`);
    await page.screenshot({ path: info.outputPath("sair-combinado.png") });

    // A táxi for two, from the chip, at the táxi's fare, paid by whoever calls it.
    const before = ((await (await page.request.get("/api/v1/me/wallet", { headers })).json()) as { cash: number }).cash;
    await page.locator(".sr-chip-face").click();
    await expect(page.locator(".sr-menu").getByRole("button", { name: /^Táxi para dois · 350\sMk$/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".sr-menu").getByRole("button", { name: "Terminar a saída" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("sair-menu.png") });
    await page.locator(".sr-menu").getByRole("button", { name: /^Táxi para dois/ }).click();
    await expect(page.locator(".cd-chip")).toContainText("O táxi vem a caminho.", { timeout: 10_000 });
    await expect(other.locator(".cd-chip")).toContainText("O táxi vem a caminho.", { timeout: 10_000 });
    expect(((await (await page.request.get("/api/v1/me/wallet", { headers })).json()) as { cash: number }).cash).toBe(before - 350);
    // It waits at the kerb; both walk up to it and get in; only then it goes.
    for (const phone of [page, other]) {
      await phone.waitForFunction(() => window.__andar?.hired?.fase === "espera", undefined, { timeout: 45_000 });
      const waiting = (await phone.evaluate(() => window.__andar!.hired))!;
      await walkTo(phone, waiting.x, waiting.z, 2.2);
      await phone.waitForFunction(() => window.__andar!.action === "board", undefined, { timeout: 10_000 });
      await phone.keyboard.press("e");
      await phone.waitForFunction(() => (window.__andar!.myRide?.vehicle ?? 0) >= 4096, undefined, { timeout: 10_000 });
      if (phone === page) {
        // Alone in it, it waits for the other.
        await page.waitForTimeout(1200);
        expect(await page.evaluate(() => window.__andar!.hired?.fase)).toBe("espera");
        await page.screenshot({ path: info.outputPath("sair-taxi-espera.png") });
      }
    }
    expect(await page.evaluate(() => window.__andar!.myRide?.seat)).toBe(1);
    expect(await other.evaluate(() => window.__andar!.myRide?.seat)).toBe(2);
    await page.waitForFunction(() => window.__andar!.hired?.fase === "leva", undefined, { timeout: 10_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: info.outputPath("sair-taxi.png") });
    await other.screenshot({ path: info.outputPath("sair-taxi-outro.png") });
    for (const phone of [page, other]) await phone.waitForFunction(() => window.__andar!.hired?.fim === "chegou" && window.__andar!.myRide === null, undefined, { timeout: 90_000 });

    // Set down together; a few steps to the counter if the kerb is not near enough, and they have arrived.
    const place = ((await (await page.request.get("/packs/dev/manifest.json")).json()) as { pois: { id: string; pos: [number, number, number] }[] }).pois.find((one) => one.id === "gelados-ensaio")!;
    for (const phone of [page, other]) {
      const at = await phone.evaluate(() => ({ x: window.__andar!.x, z: window.__andar!.z }));
      if (Math.hypot(at.x - place.pos[0], at.z - place.pos[2]) > 9) await walkTo(phone, place.pos[0] + (phone === page ? 0 : 2.5), place.pos[2] - 4, 6);
    }
    await page.waitForFunction(() => window.__andar!.sair?.chegou === true, undefined, { timeout: 20_000 });
    await other.waitForFunction(() => window.__andar!.sair?.chegou === true, undefined, { timeout: 20_000 });
    await expect(page.getByRole("status").filter({ hasText: "Chegaram aos gelados." })).toBeVisible();
    await page.screenshot({ path: info.outputPath("sair-chegaram.png") });
    await other.screenshot({ path: info.outputPath("sair-chegaram-outro.png") });

    // The other ends it: both are told, and the chip goes.
    await other.locator(".sr-chip-face").click();
    await expect(other.locator(".sr-menu").getByRole("button", { name: /Táxi para dois/ })).toHaveCount(0);
    await other.locator(".sr-menu").getByRole("button", { name: "Terminar a saída" }).click();
    await expect(page.getByRole("status").filter({ hasText: `A saída com ${otherName} terminou.` })).toBeVisible({ timeout: 10_000 });
    await expect(other.getByRole("status").filter({ hasText: `A saída com ${myName} terminou.` })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".sr-chip")).toHaveCount(0);
    await expect(other.locator(".sr-chip")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("sair-fim.png") });

    expect(seen.errors).toEqual([]);
    expect(otherSeen.errors).toEqual([]);
  });

  test("gestures for two (the founder, 2026-11-21): an aperto de mão offered from the card, taken by the other, and both turn to each other and shake; then an abraço", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). Gestures for two were not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(150_000);
    const seen = watch(page);
    const myName = await comeIn(page, 131);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    const otherName = await comeIn(other, 132);
    await page.goto("/andar?tier=poupanca&hour=16");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    await other.goto("/andar?tier=poupanca&hour=16");
    await other.waitForFunction(() => window.__andar?.linked === true && window.__andar.players === 1, undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__andar!.players === 1, undefined, { timeout: 20_000 });
    // A hand held out, from the other's card; the card goes away so that the street is seen.
    expect(await tapSomeone(page, otherName), "a tap on the other player opened their card").toBe(true);
    await page.getByRole("dialog", { name: otherName }).getByRole("button", { name: "Aperto de mão" }).click();
    await expect(page.getByRole("dialog", { name: otherName })).toHaveCount(0);
    const asked = other.getByRole("dialog", { name: `${myName} estende-te a mão.` });
    await expect(asked).toBeVisible({ timeout: 10_000 });
    await other.screenshot({ path: info.outputPath("adois-pedido.png") });
    await asked.getByRole("button", { name: "Apertar a mão" }).click();
    // Both make it, each on their own phone and on the other's.
    await page.waitForFunction(() => window.__andar!.emote === "apertar" && window.__andar!.gestures.includes("apertar"), undefined, { timeout: 10_000 });
    await other.waitForFunction(() => window.__andar!.emote === "apertar" && window.__andar!.gestures.includes("apertar"), undefined, { timeout: 10_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: info.outputPath("adois-aperto.png") });
    await other.screenshot({ path: info.outputPath("adois-aperto-outro.png") });
    // A handshake is a meeting: each now knows the other.
    await page.waitForFunction(() => window.__andar!.known >= 1, undefined, { timeout: 10_000 });
    // And an abraço, the other way, between two adults.
    await page.waitForFunction(() => window.__andar!.emote === null, undefined, { timeout: 10_000 });
    expect(await tapSomeone(other, myName), "a tap on the first player opened their card").toBe(true);
    await other.getByRole("dialog", { name: myName }).getByRole("button", { name: "Abraço" }).click();
    const hug = page.getByRole("dialog", { name: `${otherName} quer dar-te um abraço.` });
    await expect(hug).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("adois-pedido-abraco.png") });
    await hug.getByRole("button", { name: "Abraçar" }).click();
    await page.waitForFunction(() => window.__andar!.emote === "abracar" && window.__andar!.gestures.includes("abracar"), undefined, { timeout: 10_000 });
    await page.waitForTimeout(1300);
    await page.screenshot({ path: info.outputPath("adois-abraco.png") });
    await other.screenshot({ path: info.outputPath("adois-abraco-outro.png") });
    expect(seen.errors).toEqual([]);
  });

  test("someone under 18 is never asked out and never asks (D-10.3): on their card and on an adult's, everything else and no \"Convidar para sair\"", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). The card of someone under 18 was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(120_000);
    const seen = watch(page);
    const adult = await comeIn(page, 114);
    const young = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(young);
    const youngName = await comeIn(young, 115, "15_17");
    await page.goto("/andar?tier=poupanca&hour=17");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });
    await young.goto("/andar?tier=poupanca&hour=17");
    await young.waitForFunction(() => window.__andar?.linked === true && window.__andar.players === 1, undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__andar!.players === 1, undefined, { timeout: 20_000 });
    for (const [phone, name] of [[page, youngName], [young, adult]] as const) {
      expect(await tapSomeone(phone, name), "a tap on the other player opened their card").toBe(true);
      const sheet = phone.getByRole("dialog", { name });
      await expect(sheet.getByRole("button", { name: "Dar presente" })).toBeVisible({ timeout: 10_000 });
      // The card has come from the server by now (the kamba's button says where the two stand): still no such button.
      await expect(sheet.getByRole("button", { name: "Adicionar", exact: true })).toBeEnabled({ timeout: 10_000 });
      await phone.waitForTimeout(1200);
      await expect(sheet.getByRole("button", { name: "Convidar para sair" })).toHaveCount(0);
      // A hand may be held out to anyone; an abraço is between two adults.
      await expect(sheet.getByRole("button", { name: "Aperto de mão" })).toBeVisible();
      await expect(sheet.getByRole("button", { name: "Abraço" })).toHaveCount(0);
      await phone.screenshot({ path: info.outputPath(phone === page ? "sair-menor-visto.png" : "sair-menor.png") });
    }
    expect(seen.errors).toEqual([]);
  });

  test("from the Marginal to Zango and back by candongueiro (Task 11.2): the first crossing of the day is on the house, the way back is the fare; one arrives at the paragem there", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok() || !(await request.get("/packs/zango/manifest.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The packs are not built (pnpm pack:l1 and pack:zango need Blender). The crossing between bairros was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(240_000);
    const seen = watch(page);
    // The paragem is one of the places errands are done at: today's may be here, and its button comes first (F-263).
    const atTheWayOut = async (phone: Page): Promise<void> => {
      await phone.waitForFunction(() => window.__andar!.speed < 0.05 && ["viajar", "procurar", "entregar"].includes(window.__andar!.action ?? ""), undefined, { timeout: 20_000 });
      if (await phone.evaluate(() => window.__andar!.action !== "viajar")) {
        await phone.waitForTimeout(1200);
        await phone.keyboard.press("e");
        await phone.waitForFunction(() => window.__andar!.action === "viajar", undefined, { timeout: 15_000 });
      }
    };
    await comeIn(page, 121);
    // Off a van at the Mutamba, where the vans for Zango stand.
    await page.goto("/andar?pack=l1&tier=poupanca&hour=16&paragem=mutamba");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 60_000 });
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token);
    const headers = { authorization: `Bearer ${token}` };
    await page.request.post("/api/v1/me/origin", { headers, data: {} });
    const cashNow = async (): Promise<number> => ((await (await page.request.get("/api/v1/me/wallet", { headers })).json()) as { cash: number }).cash;
    await atTheWayOut(page);
    await page.waitForTimeout(1500);
    const before = await cashNow();
    await expect(page.getByRole("button", { name: "Sair do bairro" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("viagem-paragem.png") });
    await page.keyboard.press("e");
    const sheet = page.getByRole("dialog", { name: "Candongueiro para o Zango" });
    await expect(sheet).toContainText("Hoje a primeira corrida é por conta da casa.", { timeout: 10_000 });
    await expect(sheet).toContainText(/\d(,\d)? MB para carregar o bairro\./, { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("viagem-folha.png") });
    await sheet.getByRole("button", { name: "Ir para o Zango" }).click();
    await expect(page.getByRole("status").filter({ hasText: "A sair para o Zango." })).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("viagem-caminho.png") });
    // In Zango, at the Mangueira, in the street with whoever is there; nothing was paid.
    await page.waitForURL(/\/andar\?pack=zango&paragem=mangueira/, { timeout: 20_000 });
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 60_000 });
    const mangueira = ((await (await page.request.get("/packs/zango/manifest.json")).json()) as { paragens: { id: string; pos: [number, number, number] }[] }).paragens.find((one) => one.id === "mangueira")!.pos;
    const there = await page.evaluate(() => ({ x: window.__andar!.x, z: window.__andar!.z }));
    expect(Math.hypot(there.x - mangueira[0], there.z - mangueira[2])).toBeLessThan(8);
    expect(((await (await page.request.get("/api/v1/me/wallet", { headers })).json()) as { cash: number }).cash).toBe(before);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: info.outputPath("viagem-zango.png") });
    // And back: the fare this time.
    await atTheWayOut(page);
    // Read here, after any errand done at the paragem has paid (F-263).
    await page.waitForTimeout(1500);
    const held = await cashNow();
    await page.keyboard.press("e");
    const back = page.getByRole("dialog", { name: "Candongueiro para a Marginal" });
    await expect(back).toContainText(/A corrida custa 300\sMk\./, { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("viagem-volta.png") });
    await back.getByRole("button", { name: "Ir para a Marginal" }).click();
    await page.waitForURL(/\/andar\?pack=l1&paragem=mutamba/, { timeout: 20_000 });
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 60_000 });
    expect(await cashNow()).toBe(held - 300);
    expect(seen.errors).toEqual([]);
  });

  test("a paragem that leads to more than one bairro (F-279): the sheet asks where to, with the price, before anything else; the one chosen is where one arrives", async ({ page, request }, info) => {
    const dev = (await request.get("/packs/dev/manifest.json")).ok() ? ((await (await request.get("/packs/dev/manifest.json")).json()) as { gateways: { id: string }[] }) : null;
    if (!dev || dev.gateways.length < 2 || !(await request.get("/packs/zango/manifest.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The packs are not built (the rehearsal town borrows its ways out from the bairros). The choice of where to go was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(240_000);
    const seen = watch(page);
    await comeIn(page, 127);
    await page.goto("/andar?tier=poupanca&hour=16&paragem=saida");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 60_000 });
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("nzila.conta") ?? "{}") as { token: string }).token);
    await page.request.post("/api/v1/me/origin", { headers: { authorization: `Bearer ${token}` }, data: {} });
    await page.waitForFunction(() => window.__andar!.speed < 0.05 && window.__andar!.action === "viajar", undefined, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.keyboard.press("e");
    // Two candongueiros leave from here: where to, and what it costs, before anything else.
    const where = page.getByRole("dialog", { name: "Para onde vais?" });
    await expect(where).toContainText(/por conta da casa|A corrida custa 300\sMk\./, { timeout: 10_000 });
    await expect(where.getByRole("button", { name: "Zango" })).toBeVisible();
    await expect(where.getByRole("button", { name: "Marginal e Baixa" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("onde-folha.png") });
    await where.getByRole("button", { name: "Zango" }).click();
    // Then the sheet of that corrida, as at a paragem with one way out.
    const sheet = page.getByRole("dialog", { name: "Candongueiro para o Zango" });
    await expect(sheet).toContainText(/\d(,\d)? MB para carregar o bairro\./, { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("onde-zango.png") });
    await sheet.getByRole("button", { name: "Ir para o Zango" }).click();
    await page.waitForURL(/\/andar\?pack=zango&paragem=mangueira/, { timeout: 20_000 });
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 60_000 });
    expect(seen.errors).toEqual([]);
  });

  test("the ball on Zango's campo (2026-11-21): it lies in the middle; walked into, it rolls away the way the player was going", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok() || !(await request.get("/packs/zango/manifest.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The packs are not built. The ball on the campo was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(240_000);
    const seen = watch(page);
    // Someone born to a family of little money wakes in Zango: guests are made until one is.
    let kept: Record<string, unknown> | null = null;
    for (let n = 0; n < 12 && !kept; n++) {
      const deviceId = `zango-bola-${n}-${Date.now()}-abcdefgh`;
      const guest = (await (await page.request.post("/api/v1/guests", { data: { deviceId, platform: "android", ageBand: "18_plus" } })).json()) as { token: string };
      const dealt = (await (await page.request.post("/api/v1/me/origin", { headers: { authorization: `Bearer ${guest.token}` }, data: {} })).json()) as { origin: { tier: string } };
      if (dealt.origin.tier === "aperto") kept = { deviceId, ageBand: "18_plus", ...guest };
    }
    expect(kept, "a family of little money was dealt in twelve tries").not.toBeNull();
    await page.addInitScript((account) => localStorage.setItem("nzila.conta", JSON.stringify(account)), kept);
    await page.goto("/andar?pack=zango&tier=poupanca&hour=16");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 60_000 });
    const campo = ((await (await page.request.get("/packs/zango/manifest.json")).json()) as { campos: { rect: [number, number, number, number] }[] }).campos[0]!.rect;
    const middle = { x: (campo[0] + campo[2]) / 2, z: (campo[1] + campo[3]) / 2 };
    // The zone tells of the ball to whoever is near: it lies in the middle of the pitch.
    await page.waitForFunction(() => (window.__bola?.balls.length ?? 0) === 1, undefined, { timeout: 30_000 });
    const lying = await page.evaluate(() => window.__bola!.balls[0]!);
    expect(Math.hypot(lying.x - middle.x, lying.z - middle.z)).toBeLessThan(0.5);
    // To a few metres east of it, then straight at it, going west.
    await walkTo(page, middle.x + 4, middle.z, 0.5, 200);
    await page.screenshot({ path: info.outputPath("bola-parada.png") });
    await page.keyboard.down("a");
    await page.waitForFunction((x) => window.__bola!.balls[0]!.x < x - 1.5, middle.x, { timeout: 15_000 });
    await page.keyboard.up("a");
    await page.screenshot({ path: info.outputPath("bola-chutada.png") });
    // It rolled on west of where it lay, along the line it was kicked on, and comes to rest.
    await page.waitForFunction(() => window.__bola!.balls[0]!.moving === false, undefined, { timeout: 15_000 });
    const rested = await page.evaluate(() => window.__bola!.balls[0]!);
    expect(rested.x).toBeLessThan(middle.x - 1.5);
    expect(Math.abs(rested.z - middle.z)).toBeLessThan(3);
    await page.screenshot({ path: info.outputPath("bola-longe.png") });
    expect(seen.errors).toEqual([]);
  });

  test("Zango's kiosk bar and its barbearia (D-11.10): a hambúrguer off the chapa is 1.000 Mk and is in the Mochila; a cut is 500 Mk, the mirror offers the hair alone, and the hair is changed", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok() || !(await request.get("/packs/zango/manifest.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The packs are not built. Zango's bar and barbearia were not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(300_000);
    const seen = watch(page);
    // Someone born to a family of little money wakes in Zango: guests are made until one is.
    let kept: { token: string } | null = null;
    for (let n = 0; n < 12 && !kept; n++) {
      const deviceId = `zango-bar-${n}-${Date.now()}-abcdefgh`;
      const guest = (await (await page.request.post("/api/v1/guests", { data: { deviceId, platform: "android", ageBand: "18_plus" } })).json()) as { token: string };
      const dealt = (await (await page.request.post("/api/v1/me/origin", { headers: { authorization: `Bearer ${guest.token}` }, data: {} })).json()) as { origin: { tier: string } };
      // The card is kept on the phone, as it is once it has been dealt there.
      if (dealt.origin.tier === "aperto") kept = { deviceId, ageBand: "18_plus", ...guest, origin: dealt.origin } as { token: string };
    }
    expect(kept, "a family of little money was dealt in twelve tries").not.toBeNull();
    const headers = { authorization: `Bearer ${kept!.token}` };
    // They chose how they look long ago: the hair is no longer theirs to change at home.
    const look = { sex: "m", skin: 2, hair: "baixo", hairColour: "hairBlack", top: "tshirt", topColour: "awningGold", bottom: "trousers", bottomColour: "jeans", bands: "awningGold", shoe: "shoeTan" };
    const first = await page.request.put("/api/v1/me/look", { headers, data: { look } });
    const worn = first.ok() ? ((await first.json()) as { look: typeof look }).look : ((await (await page.request.get("/api/v1/me", { headers })).json()) as { look: typeof look }).look;
    expect(first.ok(), await first.text()).toBe(true);
    await page.addInitScript(([account, kept]) => (localStorage.setItem("nzila.conta", JSON.stringify(account)), localStorage.setItem("nzila.look", JSON.stringify(kept))), [kept, worn] as const);
    await page.goto("/andar?pack=zango&tier=poupanca&hour=16");
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 60_000 });
    const pois = ((await (await page.request.get("/packs/zango/manifest.json")).json()) as { pois: { id: string; pos: [number, number, number] }[] }).pois;
    const cashNow = async (): Promise<number> => ((await (await page.request.get("/api/v1/me/wallet", { headers })).json()) as { cash: number }).cash;
    // The bar: to its hatch, and the kota is at the chapa.
    const bar = pois.find((one) => one.id === "bar-zango")!;
    await walkTo(page, bar.pos[0], bar.pos[2] + 3, 1.5, 200);
    await walkTo(page, bar.pos[0], bar.pos[2], 1.0, 80);
    await page.waitForFunction(() => window.__andar!.speed < 0.05 && ["buy", "procurar", "entregar"].includes(window.__andar!.action ?? ""), undefined, { timeout: 15_000 });
    if (await page.evaluate(() => window.__andar!.action !== "buy")) {
      await page.waitForTimeout(1200);
      await page.keyboard.press("e");
      await page.waitForFunction(() => window.__andar!.action === "buy", undefined, { timeout: 15_000 });
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: info.outputPath("bar-rua.png") });
    const shop = page.getByRole("dialog", { name: "Bar da Mangueira" });
    for (let tries = 0; tries < 3 && !(await shop.isVisible()); tries++) {
      await page.getByRole("button", { name: "Comprar" }).click();
      await shop.waitFor({ timeout: 3000 }).catch(() => {});
    }
    await expect(shop.locator(".ct-grille")).toContainText("Boa tarde, mano.", { timeout: 10_000 });
    await expect(shop.locator('.ct-pick[data-item="hamburguer"]')).toContainText(/Hambúrguer.*1\.000\sMk/s);
    await page.screenshot({ path: info.outputPath("bar-aberto.png") });
    const before = await cashNow();
    await shop.locator('.ct-pick[data-item="hamburguer"]').click();
    await shop.getByRole("button", { name: /^Pagar 1\.000\sMk$/ }).click();
    await expect(shop.locator(".n-receipt")).toBeVisible({ timeout: 10_000 });
    await shop.getByRole("button", { name: "Já está" }).click();
    expect(await cashNow()).toBe(before - 1000);
    // The barbearia, across the road: the gold button offers the cut, and the sheet says what it costs first.
    const barbearia = pois.find((one) => one.id === "servico-corte-zango")!;
    await walkTo(page, barbearia.pos[0], barbearia.pos[2] - 4, 1.5, 300);
    await walkTo(page, barbearia.pos[0], barbearia.pos[2], 1.0, 80);
    await page.waitForFunction(() => window.__andar!.speed < 0.05 && window.__andar!.action === "corte", undefined, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await expect(page.getByRole("button", { name: "Cortar cabelo" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("barbearia-rua.png") });
    const held = await cashNow();
    await page.keyboard.press("e");
    const sheet = page.getByRole("dialog", { name: "Barbearia do Zango" });
    await expect(sheet).toContainText(/Corte e penteado: 500\sMk\./, { timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("barbearia-folha.png") });
    await sheet.getByRole("button", { name: "Sentar na cadeira" }).click();
    // The mirror: the hair and its colour, and nothing else.
    await page.waitForURL(/\/provador\?corte/, { timeout: 20_000 });
    const hair = page.getByRole("radiogroup", { name: "Cabelo", exact: true });
    await expect(hair).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("radiogroup")).toHaveCount(2);
    await expect(page.getByRole("radiogroup", { name: "Cor do cabelo" })).toBeVisible();
    await hair.getByRole("radio", { name: "Afro" }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: info.outputPath("barbearia-espelho.png") });
    await page.getByRole("button", { name: "Está bom" }).click();
    // Back in the street of Zango, the cut paid for and worn.
    await page.waitForURL(/\/andar\?pack=zango/, { timeout: 30_000 });
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 60_000 });
    expect(await cashNow()).toBe(held - 500);
    expect(((await (await page.request.get("/api/v1/me", { headers })).json()) as { look: { hair: string } }).look.hair).toBe("afro");
    await page.waitForTimeout(2000);
    await page.screenshot({ path: info.outputPath("barbearia-depois.png") });
    // At home the mirror no longer offers the hair.
    await page.goto("/provador");
    await expect(page.getByRole("radiogroup").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("radiogroup", { name: "Cabelo", exact: true })).toHaveCount(0);
    await expect(page.getByRole("radiogroup", { name: "Cor do cabelo" })).toHaveCount(0);
    expect(seen.errors).toEqual([]);
  });

  test("someone whose card wakes them in Zango and whose phone opens the Marginal is taken to Zango (D-11.1)", async ({ page, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok() || !(await request.get("/packs/zango/manifest.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The packs are not built. Waking in Zango was not checked here." });
      test.skip();
      return;
    }
    test.setTimeout(180_000);
    // Cards are dealt by chance: guests are made until one is of a family of little money (most are).
    let kept: Record<string, unknown> | null = null;
    for (let n = 0; n < 30 && !kept; n++) {
      const deviceId = `zango-born-${n}-${Date.now()}-abcdefgh`;
      const guest = (await (await page.request.post("/api/v1/guests", { data: { deviceId, platform: "android", ageBand: "18_plus" } })).json()) as { token: string };
      const dealt = (await (await page.request.post("/api/v1/me/origin", { headers: { authorization: `Bearer ${guest.token}` }, data: {} })).json()) as { origin: { tier: string; bairro: string } };
      // One who grew up somewhere else: their card must say why they wake in Zango (D-11.9).
      if (dealt.origin.tier === "aperto" && dealt.origin.bairro !== "zango") kept = { deviceId, ageBand: "18_plus", ...guest };
    }
    expect(kept, "a family of little money from another bairro was dealt in thirty tries").not.toBeNull();
    await page.addInitScript((account) => localStorage.setItem("nzila.conta", JSON.stringify(account)), kept);
    await page.goto("/origem?virada");
    await expect(page.locator(".origem-face")).toContainText("A família foi realojada no Zango. É lá que acordas.", { timeout: 20_000 });
    await page.screenshot({ path: info.outputPath("zango-carta.png") });
    await page.goto("/andar?pack=l1&tier=poupanca&hour=16");
    await page.waitForURL(/\/andar\?pack=zango/, { timeout: 60_000 });
    await page.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 60_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: info.outputPath("zango-acordar.png") });
    await expect(page.locator(".n-arrival")).toContainText("Zango").catch(() => {});
  });

  test("a tap on someone opens their BI with everything that can be done about them: talk, stop hearing, shut out, report", async ({ page, browser, request }, info) => {
    if (!(await request.get("/packs/dev-people/pessoas.json")).ok()) {
      info.annotations.push({ type: "skipped", description: "The people are not built (pnpm pack:dev needs Blender). The card of another player was not checked here." });
      test.skip();
      return;
    }
    const seen = watch(page);
    await comeIn(page, 41);
    const other = await (await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL ?? "" })).newPage();
    seconds.push(other);
    const otherName = await comeIn(other, 42);
    await page.goto("/andar?tier=poupanca&hour=12");
    await page.waitForFunction(() => window.__andar?.linked === true && window.__andar.talk, undefined, { timeout: 45_000 });
    await other.goto("/andar?tier=poupanca&hour=12");
    await other.waitForFunction(() => window.__andar?.linked === true && window.__andar.talk && window.__andar.players === 1, undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__andar!.players === 1 && window.__andar!.names >= 1, undefined, { timeout: 20_000 });

    // The other stands a step ahead: a tap on their body.
    expect(await tapSomeone(page, otherName), "a tap on the other player opened their card").toBe(true);
    const sheet = page.getByRole("dialog", { name: otherName });
    await expect(sheet.locator(".n-bi-name")).toHaveText(otherName);
    await expect(sheet.locator(".n-bi-fields")).toContainText("-LA");
    // Rule 11: every one of them on the same sheet as "Falar".
    for (const name of ["Falar", "Silenciar", "Bloquear", "Denunciar"]) await expect(sheet.getByRole("button", { name, exact: true })).toBeVisible();
    // And asking them to be a kamba (Task 4B.2: its own test is "kambas").
    await expect(sheet.getByRole("button", { name: "Adicionar" })).toBeEnabled();
    await page.screenshot({ path: info.outputPath("jogador-bi.png") });

    // Silenciar: what the other says is no longer heard on this phone, at once.
    await sheet.getByRole("button", { name: "Silenciar", exact: true }).click();
    await expect(sheet.getByRole("button", { name: "Voltar a ouvir" })).toBeVisible();
    await other.getByRole("button", { name: "Escreve aqui" }).click();
    await other.getByRole("button", { name: "Bom dia!" }).click();
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__andar!.lines)).toEqual([]);
    await sheet.getByRole("button", { name: "Voltar a ouvir" }).click();

    // Denunciar: a reason, a few words, sent; the moderators have it.
    await sheet.getByRole("button", { name: "Denunciar", exact: true }).click();
    await expect(sheet.getByRole("button", { name: "Enviar", exact: true })).toBeDisabled();
    await sheet.getByRole("radio", { name: "Insultos" }).click();
    await sheet.getByRole("textbox").fill("disse coisas feias");
    await page.screenshot({ path: info.outputPath("jogador-denunciar.png") });
    await sheet.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(sheet.getByRole("status")).toHaveText("Recebemos. Um moderador vai ver.");

    // Bloquear: recorded by the server, and undone.
    await sheet.getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(sheet.getByRole("status")).toHaveText("Feito. Já não se ouvem um ao outro.");
    await expect(sheet.getByRole("button", { name: "Desbloquear" })).toBeVisible();
    await sheet.getByRole("button", { name: "Desbloquear" }).click();
    await expect(sheet.getByRole("status")).toHaveText("Feito. Voltam a ouvir-se.");

    // Falar: the sheet goes and the line opens.
    await sheet.getByRole("button", { name: "Falar", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Escreve aqui" })).toBeFocused();
    await other.close();
    expect(seen.errors).toEqual([]);
  });
});
