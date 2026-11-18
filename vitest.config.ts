import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Three projects.
//   node:    every unit test, with coverage. `pnpm test`.
//   integration: tests that need the database. `pnpm test:integration`.
//   engines: the simulation and protocol tests again, in real browser engines, to
//            prove it computes the same numbers there as in Node (Task 0.2).
//            `pnpm test:engines`. Chromium is what Android runs, WebKit is
//            every browser on an iPhone, Firefox is the third engine.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text-summary"],
      thresholds: {
        // packages/sim decides what is true in the world. Every line of it is tested.
        "packages/sim/src/**": { lines: 100, statements: 100, functions: 100, branches: 100 },
        // packages/economy decides what is true about money. The same.
        "packages/economy/src/**": { lines: 100, statements: 100, functions: 100, branches: 100 },
        // packages/protocol reads bytes sent by machines we do not control. The same.
        "packages/protocol/src/**": { lines: 100, statements: 100, functions: 100, branches: 100 },
        // packages/games decides who wins at a table, sometimes for Makuta. The same.
        "packages/games/src/**": { lines: 100, statements: 100, functions: 100, branches: 100 },
      },
    },
    projects: [
      {
        test: {
          name: "node",
          include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "tools/**/*.test.ts"],
          exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
        },
      },
      {
        // Files named *.integration.test.ts: tests that need something outside the code.
        // The database tests need PostgreSQL (`pnpm services` starts it; each run makes and
        // drops its own database). The asset tests need Blender and KTX-Software, and skip
        // themselves, saying so, on a machine without them.
        // These suites run side by side against one PostgreSQL and real sockets, and wait on real clocks: a test is
        // given fifteen seconds, not the five a unit test gets (finding F-176).
        test: { name: "integration", testTimeout: 15_000, include: ["tests/integration/**/*.test.ts", "packages/*/src/**/*.integration.test.ts", "apps/*/src/**/*.integration.test.ts", "tools/**/*.integration.test.ts"] },
      },
      {
        test: {
          name: "engines",
          include: ["packages/sim/src/**/*.test.ts", "packages/protocol/src/**/*.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "webkit" }, { browser: "firefox" }],
          },
        },
      },
    ],
  },
});
