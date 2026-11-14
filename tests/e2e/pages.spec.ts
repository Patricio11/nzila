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

test.describe("the bench", () => {
  // A frame rate is a measurement, and the machine running the tests is doing other things
  // too. The budget is judged on the best of three runs: a slow machine can fail a fast page
  // once, but a page that is really too slow fails all three.
  test.describe.configure({ retries: 2 });

  test("runs its fixed path and holds 30 frames a second, sustained", async ({ page }, info) => {
    const slowed = await slowPhone(page);
    const seen = watch(page);
    await page.goto("/bench?auto&seconds=5");
    await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 60_000 });
    const result = await page.evaluate(() => window.__bench!);

    info.annotations.push({
      type: "bench",
      description: `sustained ${result.fpsSustained.toFixed(1)} fps, average ${result.fps.toFixed(1)}, worst 1% ${result.fpsLow.toFixed(1)}, worst frame ${result.worstFrameMs.toFixed(1)} ms, sim step ${result.simStepMs.toFixed(2)} ms${slowed ? ", processor slowed 4x" : ""} (${result.scene})`,
    });
    expect(result.frames).toBeGreaterThan(60);
    // The frame budget is held on the phone profile. Playwright's WebKit draws without a
    // graphics card on Windows and Linux, so its frame rate says nothing about an iPhone:
    // there the bench must run cleanly, and its number is recorded but not judged. A real
    // iPhone is measured by hand on this same page (Task 1.9).
    if (slowed) expect(result.fpsSustained).toBeGreaterThanOrEqual(FPS_BUDGET);
    // A step of the simulation must leave most of its 50 ms for everything else.
    expect(result.simStepMs).toBeLessThan(25);
    expect(seen.errors).toEqual([]);
    await expect(page.getByText("The budget is 30.", { exact: false })).toBeVisible();
  });
});
