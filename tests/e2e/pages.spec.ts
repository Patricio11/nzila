declare global {
  interface Window {
    __andar?: { x: number; z: number; speed: number; ready: boolean };
  }
}

import { expect, test } from "@playwright/test";
import { FPS_BUDGET, SHELL_BUDGET_BYTES, expectLooksTheSame, expectNoSidewaysScroll, slowPhone, watch } from "./harness.ts";

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
    const moving = await page.evaluate(() => window.__andar!);
    info.annotations.push({ type: "walk", description: `from x ${start.toFixed(1)} to ${moving.x.toFixed(1)} m, at ${moving.speed.toFixed(2)} m/s` });
    expect(moving.speed).toBeGreaterThan(0.8);
    expect(moving.speed).toBeLessThan(4.6);
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
