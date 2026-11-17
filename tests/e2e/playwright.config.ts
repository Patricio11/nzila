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
// The API the game asks at /api: the real one, on a database of its own (apps/api/src/e2e-server.ts). It needs `pnpm services`.
const API_PORT = "4010";
// The zone the game asks at /zone: the real one too, on the same database (apps/zone/src/e2e-server.ts).
const ZONE_PORT = "2577";
// The Estúdio, as it was last built, asking the same API (tests/e2e/studio.spec.ts).
const STUDIO_PORT = 4176;

export default defineConfig({
  testDir: ".",
  outputDir: "../../node_modules/.cache/e2e-results",
  snapshotPathTemplate: "{testDir}/reference/{projectName}-{platform}/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, reducedMotion: "reduce" },
  webServer: [
    {
      command: "node apps/api/src/e2e-server.ts",
      url: `http://127.0.0.1:${API_PORT}/health`,
      cwd: "../..",
      env: { API_PORT },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node apps/zone/src/e2e-server.ts",
      port: Number(ZONE_PORT),
      cwd: "../..",
      env: { ZONE_PORT },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @nzila/client exec vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      cwd: "../..",
      env: { API_PORT, ZONE_PORT },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @nzila/studio exec vite preview --port ${STUDIO_PORT} --strictPort`,
      url: `http://127.0.0.1:${STUDIO_PORT}`,
      cwd: "../..",
      env: { API_PORT },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: "phone",
      use: {
        browserName: "chromium",
        viewport: { width: 360, height: 740 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        // Draw with the machine's graphics card where it has one; without these the browser
        // falls back to drawing with the processor, and a frame rate measured that way is
        // not a phone's.
        launchOptions: { args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=default"] },
      },
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
});
