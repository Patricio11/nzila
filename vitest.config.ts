import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Two projects.
//   node:    every unit test, with coverage. `pnpm test`.
//   engines: the simulation's tests again, inside real browser engines, to
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
      },
    },
    projects: [
      {
        test: {
          name: "node",
          include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "tools/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "engines",
          include: ["packages/sim/src/**/*.test.ts"],
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
