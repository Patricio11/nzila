// The reference-phone harness (Task 0.9). It serves the client as it was last
// built and opens it the way players will:
//
//   phone   Chromium at 360x740, the processor slowed four times and a slow
//           mobile network: a stand-in for the reference phone (D-0.5) until
//           the founder's two real units arrive. Cheap Android is where the
//           game is judged.
//   iphone  WebKit at iPhone size. The diaspora plays on iPhones, and Safari
//           has its own limits; it is checked from the first commit.
//
// `pnpm test:e2e` runs both. Run `pnpm build` first.

import { defineConfig, devices } from "@playwright/test";

const PORT = 4174;

export default defineConfig({
  testDir: ".",
  outputDir: "../../node_modules/.cache/e2e-results",
  snapshotPathTemplate: "{testDir}/reference/{projectName}-{platform}/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, reducedMotion: "reduce" },
  webServer: {
    command: `pnpm --filter @nzila/client exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    cwd: "../..",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: "phone",
      use: { browserName: "chromium", viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
});
