import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**", "art/**", "content/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The simulation must compute the same numbers on every machine (Task 0.2).
    // It may not read a clock or a random source, and it may not use the
    // floating-point functions whose last bits differ between engines.
    files: ["packages/sim/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["Date", "performance", "setTimeout", "setInterval", "crypto"].map((name) => ({
          name,
          message: "packages/sim takes time and randomness as arguments. See fixed.ts and rng.ts.",
        })),
      ],
      "no-restricted-properties": [
        "error",
        ...["random", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sqrt", "cbrt", "hypot", "pow", "exp", "log", "log2", "log10", "fround"].map(
          (property) => ({
            object: "Math",
            property,
            message: "Not the same in every engine. Use the integer helpers in fixed.ts and rng.ts.",
          }),
        ),
      ],
    },
  },
  {
    files: ["tools/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
