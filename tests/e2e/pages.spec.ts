declare global {
  interface Window {
    __provador?: { ready: boolean; look: { sex: string; hair: string; hairColour: string; top: string; bottom: string; extras?: string[]; tall?: number }; dressed: number };
    __cenaMoment?: (second: number) => void;
    __andar?: { at: number; known: number; x: number; z: number; speed: number; ready: boolean; seated: boolean; emote: string | null; action: string | null; lift: number; jumps: number; riding: string | null; sounds: number; names: number; waited: number; nearestVehicle: number; tangled: number; heeding: number; linked: boolean; players: number; corrections: number; channel: number | null; net: string; reconnections: number; fall: () => void; talk: boolean; balloons: number; lines: string[]; gestures: (string | null)[]; others: { x: number; z: number; name: string; still: boolean }[] };
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
    await page.goto("/?convidado");
    await page.getByRole("link", { name: /Entrar em Modo Poupança/ }).click();
    await page.waitForURL(/\/andar\?pack=l1/);
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
    await page.goto("/andar?pack=l1&telemovel=bi");
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
    await second.waitForURL(/\/andar\?pack=l1/);
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
    await second.waitForURL(/\/andar\?pack=l1/);
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
    await again.getByRole("button", { name: "Entrar", exact: true }).click();
    await again.waitForURL((url) => url.pathname !== "/", { timeout: 30_000 });
    await again.context().close();
    expect(seen.errors.filter((error) => !error.includes("409") && !error.includes("400"))).toEqual([]);
  });
});

test.describe("two phones in the same street", () => {
  // The second phone of each test. Closed whatever happens: a phone left in the street by a test that failed
  // would be a stranger in the next test's channel.
  const seconds: Page[] = [];
  test.afterEach(async () => {
    for (const left of seconds.splice(0)) await left.context().close().catch(() => {});
  });
  /** A guest made by the API, kept on the phone as the door would have kept it. */
  const comeIn = async (page: Page, n: number): Promise<string> => {
    const deviceId = `two-phones-${n}-${Date.now()}-abcdefgh`;
    const made = await page.request.post("/api/v1/guests", { data: { deviceId, platform: "android", ageBand: "18_plus" } });
    expect(made.status()).toBe(201);
    const guest = (await made.json()) as { playerId: string; token: string; name: string; biNumber: string; arrivedAt: string };
    await page.addInitScript((kept) => localStorage.setItem("nzila.conta", JSON.stringify(kept)), { deviceId, ageBand: "18_plus", ...guest });
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

    // The first walks away for three seconds; the second watches them go, smoothly.
    const before = theirs.others[0]!;
    const watched: { x: number; z: number }[] = [];
    await page.keyboard.down("d");
    for (let n = 0; n < 30; n++) {
      watched.push(await other.evaluate(() => ({ x: window.__andar!.others[0]?.x ?? NaN, z: window.__andar!.others[0]?.z ?? NaN })));
      await other.waitForTimeout(100);
    }
    await page.keyboard.up("d");
    const after = await other.evaluate(() => window.__andar!.others[0]!);
    const went = Math.hypot(after.x - before.x, after.z - before.z);
    expect(went).toBeGreaterThan(1.5);
    // A walking pace, and never a jump of more than a stride between two looks a tenth of a second apart.
    const steps = watched.slice(1).map((at, n) => Math.hypot(at.x - watched[n]!.x, at.z - watched[n]!.z));
    expect(Math.max(...steps)).toBeLessThan(0.8);
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
    await page.keyboard.down("d");
    await other.waitForFunction((was) => Math.hypot(window.__andar!.others[0]!.x - was.x, window.__andar!.others[0]!.z - was.z) > 1, before, { timeout: 15_000 });
    await page.keyboard.up("d");
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
    await page.keyboard.down("d");
    for (let n = 0; n < 50; n++) {
      watched.push(await other.evaluate(() => ({ x: window.__andar!.others[0]?.x ?? NaN, z: window.__andar!.others[0]?.z ?? NaN, at: window.__andar!.at })));
      await other.waitForTimeout(100);
    }
    await page.keyboard.up("d");
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
    const had = born.wallet.cash;
    const dotted = (amount: number): string => String(amount).replace(/\B(?=(\d{3})+$)/g, ".");
    expect(had).toBeGreaterThanOrEqual(1500);
    // The town's caixa is a few steps from where people arrive: standing still there, the button offers it.
    await page.screenshot({ path: info.outputPath("caixa-rua.png") });
    await page.getByRole("button", { name: "Usar a caixa" }).click();
    const banco = page.getByRole("dialog", { name: "Telemóvel" });
    await expect(banco.locator(".tm-bank-risk")).toContainText("Na carteira");
    await expect(banco.locator(".tm-bank-risk dd")).toContainText(dotted(had));
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
    expect(now).toMatchObject({ cash: had - 300, bank: 300 });
    await page.getByRole("button", { name: "Fechar" }).first().click();
    await expect(page.locator(".n-chip").first()).toContainText(dotted(had - 300));
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

    // The other stands a step ahead, in the middle of the picture: a tap on their body.
    const size = page.viewportSize()!;
    let opened = false;
    for (const [dx, dy] of [[0, -0.02], [0, -0.08], [0.04, -0.05], [-0.04, -0.05], [0, 0.03]] as const) {
      await page.mouse.click(size.width * (0.5 + dx), size.height * (0.6 + dy));
      if (await page.getByRole("dialog", { name: otherName }).isVisible().catch(() => false)) {
        opened = true;
        break;
      }
    }
    expect(opened, "a tap on the other player opened their card").toBe(true);
    const sheet = page.getByRole("dialog", { name: otherName });
    await expect(sheet.locator(".n-bi-name")).toHaveText(otherName);
    await expect(sheet.locator(".n-bi-fields")).toContainText("-LA");
    // Rule 11: every one of them on the same sheet as "Falar".
    for (const name of ["Falar", "Silenciar", "Bloquear", "Denunciar"]) await expect(sheet.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Adicionar" })).toBeDisabled();
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
