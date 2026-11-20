// The Estúdio in a real browser, against the real API and a real zone (Task 3.8):
// a moderator signs in, reads a report a player made, silences the player it is
// about, finds them, sees their channel, and reads what was written in the log.
//
// The Estúdio is a page for a desk, so it is run once, in Chromium at a desk's
// size; the phone projects skip it.

import { expect, test } from "@playwright/test";

const STUDIO = "http://127.0.0.1:4176";
const GAME = "http://localhost:4174";
const API = "http://127.0.0.1:4010";

test.describe("the Estúdio", () => {
  test.use({ viewport: { width: 1180, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("a moderator signs in, answers a report, looks the player up, sees the channels and the log, suspends a player who is in the street and that player is told; someone else's role sees only its own", async ({ page, request, browser }, info) => {
    test.skip(info.project.name !== "phone", "A desk's page: checked once, in Chromium.");
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(String(error)));
    page.on("console", (message) => {
      // A refused request is the browser's own line for an answer the page has words for; anything else is a fault.
      if (message.type() === "error" && !/Failed to load resource/.test(message.text())) problems.push(message.text());
    });

    // Two players; the second says something and the first reports them.
    const guest = async (n: number) => {
      const made = await request.post(`${API}/v1/guests`, { data: { deviceId: `estudio-${n}-${Date.now()}-abcdefgh`, platform: "android", ageBand: "18_plus" } });
      expect(made.status()).toBe(201);
      return { deviceId: `estudio-${n}-${Date.now()}-abcdefgh`, ...((await made.json()) as { playerId: string; token: string; name: string; biNumber: string; arrivedAt: string }) };
    };
    const me = await guest(1);
    const them = await guest(2);
    const reported = await request.post(`${API}/v1/reports`, { headers: { authorization: `Bearer ${me.token}` }, data: { biNumber: them.biNumber, reason: "insults", note: "Chamou-me nomes junto à paragem." } });
    expect(reported.status()).toBe(200);
    // The reported player is in the street, on a phone of their own.
    const phone = await (await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" })).newPage();
    await phone.addInitScript((kept) => localStorage.setItem("nzila.conta", JSON.stringify(kept)), { ageBand: "18_plus", ...them });
    await phone.goto(`${GAME}/andar?tier=poupanca&hour=12`);
    await phone.waitForFunction(() => window.__andar?.linked === true, undefined, { timeout: 45_000 });

    // The door: a wrong password opens nothing and says so.
    await page.goto(STUDIO);
    await expect(page.getByRole("heading", { name: "Estúdio" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("estudio-porta.png") });
    await page.getByLabel("Endereço de email").fill("moderacao@nzila.test");
    await page.getByLabel("Palavra-passe").fill("errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toHaveText("O endereço ou a palavra-passe não estão certos.");
    await page.getByLabel("Palavra-passe").fill("palavra-passe-dos-testes");
    await page.getByRole("button", { name: "Entrar" }).click();

    // Moderação: the report, with who and what, waiting.
    const sheet = page.locator(".es-report").filter({ hasText: them.biNumber });
    await expect(sheet).toContainText("Insultos");
    await expect(sheet).toContainText("Chamou-me nomes junto à paragem.");
    await expect(sheet).toContainText(me.name);
    await expect(page.getByRole("button", { name: /Moderação/ })).toContainText(/\d/);
    await page.screenshot({ path: info.outputPath("estudio-moderacao.png"), fullPage: true });

    // Nothing can be done without saying why.
    await expect(sheet.getByRole("button", { name: "Silenciar" })).toBeDisabled();
    await sheet.getByLabel("Porquê (fica escrito no registo)").fill("Insultos repetidos junto à paragem");
    await sheet.getByRole("button", { name: "Silenciar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "fechada" })).toContainText("Silenciado 1 dia");
    await expect(page.locator(".es-report").filter({ hasText: them.biNumber })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("estudio-fila-depois.png"), fullPage: true });

    // Jogadores: found by BI number, only with a reason; the mute stands on their sheet, and can be lifted.
    await page.getByRole("button", { name: "Jogadores" }).click();
    await page.screenshot({ path: info.outputPath("estudio-jogadores-vazio.png") });
    await page.getByLabel("Número do BI ou nome").fill(them.biNumber);
    await page.getByLabel("Porquê precisas de ver (fica escrito)").fill("A rever a denúncia que fechei");
    await page.getByRole("button", { name: "Procurar" }).click();
    const player = page.locator(".es-player");
    await expect(player.getByRole("heading", { name: them.name })).toBeVisible();
    await expect(player.locator("header .es-tag-hot")).toHaveText("Silenciado");
    await expect(player).toContainText("canal 1");
    await expect(player).toContainText("1 contra");
    await page.screenshot({ path: info.outputPath("estudio-jogador.png"), fullPage: true });
    await player.getByRole("button", { name: "Levantar…" }).click();
    await player.getByLabel("Porquê levantar").fill("Era só um teste");
    await player.getByRole("button", { name: "Levantar", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Medida levantada." })).toBeVisible();
    await expect(player.locator("header .es-tag-hot")).toHaveCount(0);

    // Canais: what the zones say, read every three seconds. The player is there by name, in Canal 1, and the steps are timed.
    await page.getByRole("button", { name: "Canais" }).click();
    await expect(page.locator(".es-sum")).toContainText("zona viva");
    const channel = page.locator(".es-channel").filter({ hasText: them.name });
    await expect(channel.getByRole("heading", { name: "Canal 1" })).toBeVisible();
    await expect(channel).toContainText(/Passo \d/);
    await page.screenshot({ path: info.outputPath("estudio-canais.png"), fullPage: true });

    // From their name to their sheet; suspended for a day, with why. Their phone is put out of the channel within
    // seconds and told so, in the game's own words; they are left walking their own street.
    await channel.getByRole("button", { name: them.name }).click();
    await expect(page.getByLabel("Número do BI ou nome")).toHaveValue(them.biNumber);
    await page.getByLabel("Porquê precisas de ver (fica escrito)").fill("Voltou a insultar depois do aviso");
    await page.getByRole("button", { name: "Procurar" }).click();
    await player.getByLabel("Porquê (fica escrito no registo)").fill("Voltou a insultar depois do aviso");
    await player.getByRole("button", { name: "Suspender" }).click();
    await expect(player.locator("header .es-tag-hot")).toHaveText("Suspenso");
    await expect(phone.getByText(/Conta suspensa até/)).toBeVisible({ timeout: 20_000 });
    expect(await phone.evaluate(() => window.__andar!.linked)).toBe(false);
    await phone.screenshot({ path: info.outputPath("estudio-jogo-suspenso.png") });
    await page.screenshot({ path: info.outputPath("estudio-jogador-suspenso.png"), fullPage: true });
    await phone.context().close();

    // Registo: every one of those, with who and why.
    await page.getByRole("button", { name: "Registo" }).click();
    const log = page.locator(".es-log tbody");
    await expect(log).toContainText("Silenciou");
    await expect(log).toContainText("Insultos repetidos junto à paragem");
    await expect(log).toContainText("Devolveu a palavra");
    await expect(log).toContainText("Viu um jogador");
    await expect(log).toContainText("Moderadora dos Testes");
    await page.screenshot({ path: info.outputPath("estudio-registo.png"), fullPage: true });

    // Out: the door again, and the token is gone from the tab.
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page.getByLabel("Palavra-passe")).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("nzila.estudio"))).toBeNull();

    // Support signs in: Jogadores and Canais are theirs, Moderação is not shown at all.
    await page.getByLabel("Endereço de email").fill("apoio@nzila.test");
    await page.getByLabel("Palavra-passe").fill("palavra-passe-dos-testes");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("button", { name: "Jogadores" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Moderação/ })).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test("the economy's staff: the money at a glance, and a number of the game changed with a preview and a reason, in play within seconds, written down (Task 4.6)", async ({ page, request }, info) => {
    test.skip(info.project.name !== "phone", "A desk's page: checked once, in Chromium.");
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error" && !/Failed to load resource/.test(message.text())) problems.push(message.text());
    });
    // Someone new is dealt their family's card: Makuta comes into the game from the families' faucet, today.
    const made = (await (await request.post(`${API}/v1/guests`, { data: { deviceId: `estudio-eco-${Date.now()}-abcdefgh`, platform: "android", ageBand: "18_plus" } })).json()) as { token: string; biNumber: string };
    expect((await request.post(`${API}/v1/me/origin`, { headers: { authorization: `Bearer ${made.token}` }, data: {} })).status()).toBe(200);
    await page.goto(STUDIO);
    await page.getByLabel("Endereço de email").fill("economia@nzila.test");
    await page.getByLabel("Palavra-passe").fill("palavra-passe-dos-testes");
    await page.getByRole("button", { name: "Entrar" }).click();
    // Economia first: the money in the game, day by day, and who gained most.
    await expect(page.getByRole("button", { name: "Economia" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Moderação/ })).toHaveCount(0);
    await expect(page.locator(".es-card").first()).toContainText("Dinheiro dos jogadores");
    await expect(page.locator(".es-days li").first()).toBeVisible();
    await expect(page.locator(".es-flows")).toContainText("Famílias (cartão de origem)");
    // Who gained most today: in a full run, the players of the other tests come first; the list is there.
    await expect(page.locator(".es-eco > table tbody tr").first()).toBeVisible();
    await page.screenshot({ path: info.outputPath("estudio-economia.png"), fullPage: true });
    // Afinar: the most minutes in the cadeia, changed; what changes is shown before anything is kept.
    await page.getByRole("button", { name: "Afinar" }).click();
    const minutes = page.getByLabel("O máximo de minutos na cadeia");
    const was = Number(await minutes.inputValue());
    await minutes.fill(String(was - 5));
    await expect(page.locator(".es-number-changed")).toHaveCount(1);
    // However far down the number is, what to do next is at the foot of the screen.
    await expect(page.getByRole("button", { name: "Ver o que muda" })).toBeInViewport();
    await page.getByRole("button", { name: "Ver o que muda" }).click();
    await page.screenshot({ path: info.outputPath("estudio-afinar-mudar.png") });
    await expect(page.locator(".es-preview")).toContainText(`O máximo de minutos na cadeia: de ${was} para ${was - 5}`);
    const save = page.getByRole("button", { name: /Guardar como versão/ });
    await expect(save).toBeDisabled();
    await page.getByLabel("Porquê").fill("penas mais curtas enquanto a cadeia não tem nada para fazer");
    const version = Number(/versão (\d+)/.exec((await save.textContent()) ?? "")![1]);
    await save.click();
    await expect(page.getByRole("status").or(page.locator(".n-banner")).first()).toContainText(`Guardado como versão ${version}`);
    await expect(page.locator(".es-afinar tbody tr").first()).toContainText("penas mais curtas");
    await expect(page.locator(".es-afinar tbody tr").first()).toContainText("Economia dos Testes");
    await page.screenshot({ path: info.outputPath("estudio-afinar.png"), fullPage: true });
    // In play: the API looks for a new version every second here (every fifteen in the game).
    await expect(async () => {
      await page.getByRole("button", { name: "Registo" }).click();
      await page.getByRole("button", { name: "Afinar" }).click();
      await expect(page.locator(".es-afinar > .es-soft").first()).toContainText(`Em jogo: versão ${version}.`, { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    // And the log says who changed the numbers, and why.
    await page.getByRole("button", { name: "Registo" }).click();
    await expect(page.locator(".es-log tbody tr").filter({ hasText: "Mudou os números do jogo" }).first()).toContainText("penas mais curtas");
    expect(problems).toEqual([]);
  });

  test("on a phone's width the Estúdio still reads: nothing runs off the side", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "Checked once, in Chromium.");
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(STUDIO);
    await page.getByLabel("Endereço de email").fill("moderacao@nzila.test");
    await page.getByLabel("Palavra-passe").fill("palavra-passe-dos-testes");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("button", { name: /Moderação/ })).toBeVisible();
    for (const [tab, there] of [["Jogadores", ".es-search"], ["Canais", ".es-sum"], ["Registo", ".es-log tbody tr"]] as const) {
      await page.getByRole("button", { name: tab }).click();
      await expect(page.locator(there).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), tab).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`estudio-estreito-${tab.toLowerCase()}.png`) });
    }
  });
});
