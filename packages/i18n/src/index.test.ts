import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { PT_AO, argumentsOf, createTranslator, formatMessage, ptAO as base, ptAOTranslator, t, type Catalog, type MessageKey } from "./index.ts";
import { ptAOLater } from "./pt-AO-later.ts";

// Both catalogs, the way in and the words fetched later, read as one.
const ptAO = { ...base, ...ptAOLater } as Readonly<Record<MessageKey, string>>;
const messageKeys = Object.keys(ptAO) as MessageKey[];

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("the catalog", () => {
  test("every key has a message that is not empty and is well formed", () => {
    for (const key of messageKeys) {
      expect(ptAO[key].trim().length, key).toBeGreaterThan(0);
      expect(() => argumentsOf(ptAO[key]), key).not.toThrow();
    }
  });

  test("every message can be filled in: no argument is left showing", () => {
    for (const key of messageKeys) {
      for (const n of [0, 1, 2, 12]) {
        const params = Object.fromEntries(argumentsOf(ptAO[key]).map((name) => [name, name === "n" ? n : "x"]));
        expect(t(key, params), key).not.toMatch(/[{}#]/);
      }
    }
  });

  test("no message names another game", () => {
    for (const key of messageKeys) {
      const text = ptAO[key].toLowerCase();
      expect(text).not.toContain("vida na banda");
      expect(text).not.toContain("mwangol");
    }
  });

  test("a context action label fits the button: 14 characters", () => {
    const actions = messageKeys.filter((key) => key.startsWith("action.") && key !== "action.withPrice");
    expect(actions.length).toBeGreaterThan(3);
    for (const key of actions) expect([...ptAO[key]].length, key).toBeLessThanOrEqual(14);
  });

  test("the game does not shout: only a player's quick phrases carry an exclamation mark", () => {
    for (const key of messageKeys) {
      if (!key.startsWith("chat.quick.")) expect(ptAO[key], key).not.toContain("!");
    }
  });

  test("no word from the glossary's 'Never write' table appears", async () => {
    const glossary = await readFile(join(root, "packages/i18n/glossary.md"), "utf8");
    const table = glossary.slice(glossary.indexOf("## Never write"), glossary.indexOf("## Grammar"));
    const never = [...table.matchAll(/^\| ([^|]+) \| [^|]+ \|$/gm)].map((m) => m[1]!.trim()).filter((word) => word !== "Never" && !/^-+$/.test(word));
    expect(never.length).toBeGreaterThan(20);
    expect(never).toContain("você");
    for (const key of messageKeys) {
      for (const word of never) {
        const whole = new RegExp(`(^|[^\\p{L}])${word}($|[^\\p{L}])`, "iu");
        expect(whole.test(ptAO[key]), `${key} uses "${word}"`).toBe(false);
      }
    }
  });
});

describe("every key used in code exists", () => {
  async function sources(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await sources(path)));
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) out.push(path);
    }
    return out;
  }

  test("each t(\"…\") in apps and packages names a key of the catalog", async () => {
    const used = new Map<string, string>();
    for (const file of [...(await sources(join(root, "apps"))), ...(await sources(join(root, "packages")))]) {
      const text = await readFile(file, "utf8");
      for (const match of text.matchAll(/\bt\(\s*["'`]([^"'`$]+)["'`]/g)) used.set(match[1]!, file);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const [key, file] of used) expect(messageKeys, `${file} uses "${key}"`).toContain(key);
    // Every source file is read: with the whole gate running beside it, five seconds were once not enough (F-260).
  }, 30_000);
});

describe("plurals and arguments", () => {
  test("in Angola only exactly one is singular", () => {
    expect(t("time.minutes", { n: 0 })).toBe("0 minutos");
    expect(t("time.minutes", { n: 1 })).toBe("1 minuto");
    expect(t("time.minutes", { n: 2 })).toBe("2 minutos");
    expect(t("time.hours", { n: 1 })).toBe("1 hora");
  });

  test("an exact case wins over the plural rule", () => {
    expect(t("route.nextVan", { n: 0 })).toBe("A chegar");
    expect(t("route.nextVan", { n: 1 })).toBe("Chega em 1 minuto");
    expect(t("route.nextVan", { n: 7 })).toBe("Chega em 7 minutos");
  });

  test("named arguments, and the price on the button", () => {
    const label = t("action.withPrice", { label: t("action.board"), price: ptAOTranslator.makuta(200) });
    expect(label).toBe("Apanhar · 200 Mk");
    expect(t("frontdoor.download", { done: "2,1", total: ptAOTranslator.dataSize(5_400_000) })).toBe("2,1 de 5,4 MB");
  });

  test("a number given as an argument is written the Angolan way", () => {
    const f = { plural: PT_AO.plural, number: ptAOTranslator.number };
    expect(formatMessage("{n, plural, one {# Makuta} other {# Makuta}} para {who}", { n: 15000, who: "ti" }, f)).toBe("15.000 Makuta para ti");
    expect(formatMessage("Tens {n}.", { n: 1500 }, f)).toBe("Tens 1.500.");
  });

  test("select chooses by a word and falls back to other", () => {
    const f = { plural: PT_AO.plural, number: String };
    const message = "{kind, select, van {O azul e branco} boat {O barco} other {O carro}} chegou.";
    expect(formatMessage(message, { kind: "van" }, f)).toBe("O azul e branco chegou.");
    expect(formatMessage(message, { kind: "bike" }, f)).toBe("O carro chegou.");
    expect(formatMessage("{a, select, x {{n, plural, one {um} other {#}}} other {-}}", { a: "x", n: 3 }, f)).toBe("3");
    expect(argumentsOf(message)).toEqual(["kind"]);
    expect(argumentsOf("{a, select, x {{n, plural, one {um} other {#}}} other {{b}}}")).toEqual(["a", "n", "b"]);
  });

  test("an argument that was not given stays visible and nothing crashes", () => {
    expect(t("time.minutes")).toBe("{n}");
    expect(t("frontdoor.poupanca")).toBe("Entrar em Modo Poupança ({size})");
  });

  test("a hash outside a plural is just a hash", () => {
    expect(formatMessage("Canal #2", {}, { plural: PT_AO.plural, number: String })).toBe("Canal #2");
  });

  test("a malformed message says where", () => {
    for (const bad of ["{", "{n", "a } b", "{n, plural, one {x}}", "{n, wrong, other {x}}", "{n, plural one {x}}", "{n, plural, one x}", "{, plural}", "{n; x}", "{n, plural, other {x}"]) {
      expect(() => argumentsOf(bad), bad).toThrow(/ at \d+ in /);
    }
  });
});

describe("numbers, money, sizes and the clock", () => {
  const { number, makuta, dataSize, clock } = ptAOTranslator;

  test("thousands are set apart by a point, as on a price in Luanda", () => {
    expect(number(0)).toBe("0");
    expect(number(950)).toBe("950");
    expect(number(1500)).toBe("1.500");
    expect(number(1_500_000)).toBe("1.500.000");
    expect(number(-15_000)).toBe("-15.000");
    expect(number(99.6)).toBe("100");
  });

  test("Makuta", () => {
    expect(makuta(150)).toBe("150 Mk");
    expect(makuta(15_000)).toBe("15.000 Mk");
  });

  test("download sizes round up below a megabyte and show one decimal above", () => {
    expect(dataSize(0)).toBe("0 KB");
    expect(dataSize(1)).toBe("1 KB");
    expect(dataSize(340_000)).toBe("340 KB");
    expect(dataSize(999_999)).toBe("1.000 KB");
    expect(dataSize(2_140_000)).toBe("2,1 MB");
    expect(dataSize(5_960_000)).toBe("6,0 MB");
  });

  test("the clock", () => {
    expect(clock(0)).toBe("00:00");
    expect(clock(17 * 3600 + 42 * 60 + 59)).toBe("17:42");
    expect(clock(86_399)).toBe("23:59");
    expect(clock(86_400)).toBe("00:00");
  });
});

test("the seam: another catalog with another language's rules", () => {
  const english = createTranslator(
    { ...ptAO, "time.minutes": "{n, plural, one {# minute} other {# minutes}}" } as Catalog,
    { locale: "en", plural: (n) => (n === 1 ? "one" : "other"), group: ",", decimal: "." },
  );
  expect(english.locale).toBe("en");
  expect(english.t("time.minutes", { n: 2 })).toBe("2 minutes");
  expect(english.makuta(15_000)).toBe("15,000 Mk");
  expect(english.dataSize(2_140_000)).toBe("2.1 MB");
  expect(ptAOTranslator.locale).toBe("pt-AO");
});
