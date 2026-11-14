// What makes the "phone" profile a slow phone, and what every page is held to.

import { existsSync } from "node:fs";
import { expect, type Page, type TestInfo } from "@playwright/test";

/** Rule 1: the shell (HTML, CSS, JS and fonts) is under 300 KB compressed. */
export const SHELL_BUDGET_BYTES = 300 * 1024;
/** Rule 1: 30 frames a second, sustained. */
export const FPS_BUDGET = 30;

/**
 * Slows the page down to the reference class: the processor four times
 * slower, and a mobile network of 1.6 Mbit/s down with 150 ms of delay.
 * Only Chromium can be slowed this way; on WebKit this does nothing.
 */
export async function slowPhone(page: Page): Promise<boolean> {
  if (page.context().browser()?.browserType().name() !== "chromium") return false;
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  return true;
}

export interface Watch {
  /** Errors the page logged or threw. */
  readonly errors: string[];
  /** Bytes that came over the network, as the server sent them (compressed). */
  bytes(): number;
}

/** Starts counting what a page downloads and what goes wrong on it. Call before `goto`. */
export function watch(page: Page): Watch {
  const errors: string[] = [];
  let total = 0;
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    void response
      .request()
      .sizes()
      .then((sizes) => {
        total += sizes.responseBodySize + sizes.responseHeadersSize;
      })
      .catch(() => {});
  });
  return { errors, bytes: () => total };
}

/** A page must never scroll sideways on a phone. */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

/**
 * Compares the page with its reference picture, when there is one for this
 * browser on this operating system. Text is drawn differently on Windows,
 * Linux and macOS, so each has its own references; where none has been made
 * yet the comparison is skipped and says so. Make them with
 * `pnpm test:e2e --update-snapshots`, look at each, and commit them.
 */
export async function expectLooksTheSame(page: Page, info: TestInfo, name: string): Promise<void> {
  const reference = info.snapshotPath(`${name}.png`);
  if (!existsSync(reference) && info.config.updateSnapshots !== "all" && info.config.updateSnapshots !== "changed") {
    info.annotations.push({ type: "no reference", description: `${reference} does not exist; the look of "${name}" was not checked here.` });
    return;
  }
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, maxDiffPixelRatio: 0.01, animations: "disabled" });
}
