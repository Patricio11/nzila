// Words and numbers as an Angolan reads them. One catalog at launch, pt-AO
// (D-0.15); the seam for others is createTranslator, which takes any catalog
// with the same keys and the rules of its language.
//
// Plurals and numbers are written here by hand, not taken from the browser's
// Intl. The browser's rule for "pt-AO" says "0 minuto", which nobody in
// Luanda says, and its number format changes between browser versions. Done
// by hand, every phone shows the same thing.

import { formatMessage, type Formatters, type Params } from "./icu.ts";
import { ptAO, type MessageKey } from "./pt-AO.ts";

export { argumentsOf, formatMessage, type Params } from "./icu.ts";
export { ptAO, type MessageKey };
export * from "./filter.ts";

export type Catalog = Readonly<Record<MessageKey, string>>;

/** How a language counts and writes numbers. */
export interface LocaleRules {
  readonly locale: string;
  /** The ICU plural category of a number: "one", "other", and so on. */
  readonly plural: (n: number) => string;
  /** Between thousands. */
  readonly group: string;
  /** Before decimals. */
  readonly decimal: string;
}

const NBSP = " ";

/** Portuguese of Angola: only exactly one is singular; "1.500" and "2,1" (the founder, 2026-11-14). */
export const PT_AO: LocaleRules = {
  locale: "pt-AO",
  plural: (n) => (n === 1 ? "one" : "other"),
  group: ".",
  decimal: ",",
};

export interface Translator {
  readonly locale: string;
  /** A message from the catalog, with its arguments filled in. */
  t(key: MessageKey, params?: Params): string;
  /** A whole number: "950", "15.000". */
  number(n: number): string;
  /** An amount of Makuta: "1.500 Mk". */
  makuta(amount: number): string;
  /** A download size: "2,1 MB", "340 KB". */
  dataSize(bytes: number): string;
  /** A time of the game day from its second: "17:42". */
  clock(secondOfDay: number): string;
}

export function createTranslator(catalog: Catalog, rules: LocaleRules): Translator {
  const number = (n: number): string => {
    const digits = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+$)/g, rules.group);
    return n < 0 ? `-${digits}` : digits;
  };
  const formatters: Formatters = { plural: rules.plural, number };
  return {
    locale: rules.locale,
    t: (key, params = {}) => formatMessage(catalog[key], params, formatters),
    number,
    makuta: (amount) => `${number(amount)}${NBSP}Mk`,
    dataSize: (bytes) => {
      if (bytes < 1_000_000) return `${number(Math.ceil(bytes / 1000))}${NBSP}KB`;
      const tenths = Math.round(bytes / 100_000);
      return `${number(Math.floor(tenths / 10))}${rules.decimal}${tenths % 10}${NBSP}MB`;
    },
    clock: (secondOfDay) => {
      const minutes = Math.floor(secondOfDay / 60);
      return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    },
  };
}

/** The game's translator. */
export const ptAOTranslator = createTranslator(ptAO, PT_AO);
export const t = ptAOTranslator.t;

export const messageKeys = Object.keys(ptAO) as MessageKey[];
