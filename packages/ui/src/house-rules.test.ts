// The house rules, enforced. Each test reads the source of the whole
// repository and fails the build on something the project has decided never
// to do. The rule numbers are those of TO_START_EVERY_SESSION.md.
//
// A rule can be checked against a sample with `violations`, which is how this
// file tests that each check really catches what it is for.

import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));

interface Source {
  /** Path from the repository root, with forward slashes. */
  readonly path: string;
  readonly text: string;
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".turbo", "coverage"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else out.push(path);
  }
  return out;
}

async function sources(): Promise<Source[]> {
  const files = [...(await walk(join(root, "apps"))), ...(await walk(join(root, "packages"))), ...(await walk(join(root, "tools")))];
  const wanted = files.filter((file) => /\.(ts|tsx|css|html)$/.test(file));
  return Promise.all(wanted.map(async (file) => ({ path: relative(root, file).replaceAll("\\", "/"), text: await readFile(file, "utf8") })));
}

const all = await sources();
const isTest = (s: Source): boolean => /\.test\.tsx?$/.test(s.path);
/** Sample content, where invented names and amounts are allowed. */
const isFixture = (s: Source): boolean => /(^|[./])fixtures\.ts$/.test(s.path);
const code = all.filter((s) => /\.tsx?$/.test(s.path) && !isTest(s) && !isFixture(s));
const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Runs a check over sources and returns "path: what" for every violation. */
function violations(list: readonly Source[], check: (s: Source) => string[]): string[] {
  return list.flatMap((s) => check(s).map((what) => `${s.path}: ${what}`));
}

// ------------------------------------------------------------------ Rule 10

// Words a player reads live in the catalog. In a component that means: no
// text between tags, no literal in an attribute that is read out or shown,
// and no accented Portuguese inside a string anywhere in the client or the UI.
function literalCopy(s: Source): string[] {
  const text = withoutComments(s.text);
  const found: string[] = [];
  // One line at a time: text in our components sits on the line of its tag.
  for (const m of text.matchAll(/>[ \t]*([^<>{}\n]*\p{L}{2}[^<>{}\n]*)</gu)) {
    // Type arguments and comparisons look like tags; text in a tag has no code punctuation.
    if (!/[=;()[\]|&]/.test(m[1]!)) found.push(`text written in a component: "${m[1]!.trim()}"`);
  }
  for (const m of text.matchAll(/\b(aria-label|title|placeholder|alt)="([^"]*\p{L}[^"]*)"/gu)) found.push(`${m[1]} written in a component: "${m[2]}"`);
  for (const m of text.matchAll(/["'`]([^"'`\n]*[áàâãçéêíóôõúÁÀÂÃÇÉÊÍÓÔÕÚ][^"'`\n]*)["'`]/g)) found.push(`Portuguese written in code: "${m[1]}"`);
  return found;
}

const playerFacing = code.filter(
  // The styleguide and the bench are pages for the team, in plain English, and are not shown to players.
  (s) =>
    (s.path.startsWith("apps/client/src/") || s.path.startsWith("packages/ui/src/")) &&
    !s.path.startsWith("apps/client/src/styleguide/") &&
    !s.path.startsWith("apps/client/src/bench/"),
);

describe("Rule 10: every word a player reads is in the catalog", () => {
  test("the check catches text, attributes and Portuguese strings", () => {
    const bad: Source = { path: "x.tsx", text: '<p>Bem-vindo a Luanda</p>\n<img alt="Uma van" />\nconst s = "Não há rede";\n// <p>a comment is fine</p>' };
    expect(violations([bad], literalCopy)).toEqual([
      'x.tsx: text written in a component: "Bem-vindo a Luanda"',
      'x.tsx: alt written in a component: "Uma van"',
      'x.tsx: Portuguese written in code: "Não há rede"',
    ]);
    const good: Source = { path: "y.tsx", text: '<p class="soft">{t("frontdoor.tagline")}</p>\nconst a: Map<string, number> = x > 1 ? y : z;\n<Glyph name="carteira" label={tr.t("hud.wallet")} />' };
    expect(violations([good], literalCopy)).toEqual([]);
  });

  test("the client and the UI package write no copy of their own", () => {
    expect(playerFacing.length).toBeGreaterThan(3);
    expect(violations(playerFacing, literalCopy)).toEqual([]);
  });
});

// ------------------------------------------------------------- the palette

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\(/g;
const NAMED = /:\s*(?:white|black|red|green|blue|yellow|orange|purple|pink|gr[ae]y|gold|silver|navy|teal|brown)\s*[;}]/gi;

function strayColour(s: Source): string[] {
  const text = withoutComments(s.text);
  return [...text.matchAll(COLOUR), ...text.matchAll(NAMED)].map((m) => `a colour outside tokens.css: ${m[0].trim()}`);
}

const styled = all.filter(
  (s) => (s.path.startsWith("apps/client/") || s.path.startsWith("packages/ui/src/")) && !isTest(s) && s.path !== "packages/ui/src/tokens.css",
);

describe("one palette: every colour is a token", () => {
  test("the check catches hex, functions and named colours", () => {
    const bad: Source = { path: "x.css", text: ".a { color: #F2A93B; background: rgba(0,0,0,.5); border-color: red; }\n/* #123456 in a comment is fine */" };
    expect(violations([bad], strayColour)).toEqual([
      "x.css: a colour outside tokens.css: #F2A93B",
      "x.css: a colour outside tokens.css: rgba(",
      "x.css: a colour outside tokens.css: : red;",
    ]);
    expect(violations([{ path: "y.css", text: ".a { color: var(--n-luz); fill: none; stroke: currentColor; background: transparent; }" }], strayColour)).toEqual([]);
  });

  test("no stylesheet, component or page of the client writes a colour", () => {
    expect(styled.length).toBeGreaterThan(5);
    // The browser's theme colour must be a literal in index.html; it is the one exception, and it must match the token.
    const found = violations(styled, strayColour).filter((v) => v !== "apps/client/index.html: a colour outside tokens.css: #0F1B2A");
    expect(found).toEqual([]);
  });

  test("the theme colour in index.html is the night token", async () => {
    const tokens = await readFile(join(root, "packages/ui/src/tokens.css"), "utf8");
    const html = await readFile(join(root, "apps/client/index.html"), "utf8");
    expect(/--n-noite:\s*(#[0-9A-Fa-f]{6})/.exec(tokens)?.[1]).toBe(/name="theme-color" content="(#[0-9A-Fa-f]{6})"/.exec(html)?.[1]);
  });
});

// ------------------------------------------------------------------ Rule 14

// A price, a wage or a cap is data. In code it shows as a number beside "Mk",
// or as a number handed straight to the function that formats Makuta.
function makutaLiteral(s: Source): string[] {
  const text = withoutComments(s.text);
  return [...text.matchAll(/\d[\d.\s_]*\s?Mk\b/g), ...text.matchAll(/\bmakuta\(\s*\d[\d_]*\s*\)/g)].map((m) => `a Makuta amount written in code: ${m[0]}`);
}

describe("Rule 14: no Makuta amount is written in code", () => {
  test("the check catches an amount beside Mk and one passed to the formatter", () => {
    const bad: Source = { path: "x.ts", text: 'const label = "Apanhar · 200 Mk";\nconst fare = tr.makuta(200);\n// 1.500 Mk in a comment is fine' };
    expect(violations([bad], makutaLiteral)).toEqual(["x.ts: a Makuta amount written in code: 200 Mk", "x.ts: a Makuta amount written in code: makuta(200)"]);
    expect(violations([{ path: "y.ts", text: "const fare = tr.makuta(tunables.fares.candongueiroLocal);" }], makutaLiteral)).toEqual([]);
  });

  test("amounts live in tunables and fixtures only", () => {
    expect(code.length).toBeGreaterThan(40);
    expect(violations(code, makutaLiteral)).toEqual([]);
  });
});

// ------------------------------------------------------------------- Rule 9

describe("Rule 9: engine code never names a district or a province", () => {
  test("no id from the registry appears in apps, packages or tools", async () => {
    const registry = JSON.parse(await readFile(join(root, "content/registry.json"), "utf8")) as { provinces: { id: string }[]; districts: { id: string }[] };
    const ids = [...registry.provinces, ...registry.districts].map((entry) => entry.id);
    expect(ids.length).toBeGreaterThan(1);
    const named = (s: Source): string[] => ids.filter((id) => new RegExp(`(^|[^a-z0-9-])${id}($|[^a-z0-9/-])`).test(s.text)).map((id) => `names "${id}"`);
    expect(violations([{ path: "x.ts", text: `if (district === "${ids[0]}") {}` }], named)).toEqual([`x.ts: names "${ids[0]}"`]);
    // Comments count too: an example in a comment is how a name creeps into a condition.
    expect(violations(code, named)).toEqual([]);
  });
});

// --------------------------------------------------------- drawn by ourselves

const FORBIDDEN = /icon|lucide|feather|fontawesome|heroicons|phosphor|@mui|antd|chakra|radix|headlessui|mantine|bootstrap|tailwind|bulma|daisyui|shadcn|framer-motion|^motion$|gsap|animejs|lottie|styled-components|@emotion/i;

describe("no third-party icon, component, style or animation library", () => {
  test("the check knows the usual ones", () => {
    for (const name of ["lucide-preact", "@fortawesome/fontawesome-free", "react-icons", "tailwindcss", "@radix-ui/react-dialog", "framer-motion", "gsap"]) {
      expect(FORBIDDEN.test(name), name).toBe(true);
    }
    for (const name of ["preact", "@preact/signals", "three", "zod", "vite", "postgres", "drizzle-orm"]) expect(FORBIDDEN.test(name), name).toBe(false);
  });

  test("no package in the repository depends on one", async () => {
    const manifests = [join(root, "package.json"), ...(await walk(join(root, "apps"))), ...(await walk(join(root, "packages"))), ...(await walk(join(root, "tools")))].filter((file) => /package\.json$/.test(file));
    expect(manifests.length).toBeGreaterThan(10);
    const found: string[] = [];
    for (const file of manifests) {
      const manifest = JSON.parse(await readFile(file, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
        if (FORBIDDEN.test(name)) found.push(`${relative(root, file)}: ${name}`);
      }
    }
    expect(found).toEqual([]);
  });
});
