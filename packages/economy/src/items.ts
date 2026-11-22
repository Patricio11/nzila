// Things (Task 4.2) and the shops that sell them (Task 4.3). What each thing
// is, how much room it takes in a Mochila and what eating or drinking it does,
// and what each kind of shop sells at what price: all data (tunables/items.json
// and tunables/shops.json, Rule 14), checked here as they load. A basket is
// priced here too, so that the API and anything else work it out the same way.
// The client proposes a basket; only the server prices it.

import itemsFile from "../tunables/items.json" with { type: "json" };
import shopsFile from "../tunables/shops.json" with { type: "json" };
import { type Mk } from "./ledger.ts";

/**
 * What a thing is for. A `presente` is bought to be given (the banca by the mercado, D-10.1). `mobilia` is what a
 * house is furnished with (Task 5.3): bought, carried home, and put where the player wants it.
 */
export const ITEM_KINDS = ["comida", "bebida", "mimo", "cozinha", "casa", "presente", "mobilia"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ITEM_USES = ["comer", "beber"] as const;
export type ItemUse = (typeof ITEM_USES)[number];

export interface ItemType {
  readonly id: string;
  readonly kind: ItemKind;
  /** Room it takes in a Mochila, in units. Nothing: a sweet, a box of matches. */
  readonly size: number;
  /** What a player does with it in the street, or null for what is used at home (to cook, to light). */
  readonly use: ItemUse | null;
  /** What eating or drinking it gives back, in points of a 10 000 point bar (Task 4.4). */
  readonly fome: number;
  readonly energia: number;
  /**
   * For `mobilia`, and for nothing else: the floor it stands on, in cells of the walk grid (half a metre), across
   * and deep as it is first set down. Turned a quarter, the two change places.
   */
  readonly chao?: readonly [number, number];
  /**
   * For `mobilia` that holds a body: how many sit on it side by side (a chair one, a sofa three), or lie on it (a
   * bed, a mattress: -1). Left out: it is looked at, and is in the way.
   */
  readonly lugares?: number;
}

export interface Catalogue {
  readonly version: number;
  /** How many units a Mochila holds. */
  readonly carryUnits: number;
  readonly items: ReadonlyMap<string, ItemType>;
}

export interface ShopList {
  readonly version: number;
  /** For each kind of shop, what it sells and for how much, in the order it is shown. */
  readonly shops: ReadonlyMap<string, readonly { readonly item: string; readonly price: Mk }[]>;
}

const ID = /^[a-z][a-z0-9-]{0,31}$/;
const whole = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** Reads a catalogue of things. Throws, saying every fault, on one that is wrong. */
export function parseCatalogue(input: unknown): Catalogue {
  const raw = input as { version?: unknown; carryUnits?: unknown; items?: unknown };
  const errors: string[] = [];
  if (!whole(raw?.version, 1, 1_000_000)) errors.push("version: a whole number from 1");
  if (!whole(raw?.carryUnits, 1, 1000)) errors.push("carryUnits: a whole number from 1 to 1000");
  const items = new Map<string, ItemType>();
  for (const [n, one] of (Array.isArray(raw?.items) ? raw.items : (errors.push("items: a list"), [])).entries()) {
    const item = one as Partial<ItemType>;
    const at = `items[${n}]`;
    if (typeof item.id !== "string" || !ID.test(item.id)) errors.push(`${at}.id: lower-case letters`);
    else if (items.has(item.id)) errors.push(`${at}.id: "${item.id}" is listed twice`);
    if (!ITEM_KINDS.includes(item.kind as ItemKind)) errors.push(`${at}.kind: one of ${ITEM_KINDS.join(", ")}`);
    if (!whole(item.size, 0, 100)) errors.push(`${at}.size: a whole number from 0 to 100`);
    if (item.use !== null && !ITEM_USES.includes(item.use as ItemUse)) errors.push(`${at}.use: comer, beber or null`);
    if (!whole(item.fome, 0, 10_000) || !whole(item.energia, 0, 10_000)) errors.push(`${at}: fome and energia are points from 0 to 10 000`);
    const floor = item.chao as unknown;
    if (item.lugares !== undefined && !(item.kind === "mobilia" && (item.lugares === -1 || whole(item.lugares, 1, 4)))) errors.push(`${at}.lugares: for mobilia, how many sit (1 to 4) or -1 to lie`);
    if ((item.kind === "mobilia") !== (floor !== undefined) || (floor !== undefined && !(Array.isArray(floor) && floor.length === 2 && whole(floor[0], 1, 12) && whole(floor[1], 1, 12)))) errors.push(`${at}.chao: for mobilia and nothing else, [cells across, cells deep], each from 1 to 12`);
    if (typeof item.id === "string") items.set(item.id, item as ItemType);
  }
  if (errors.length > 0) throw new Error(`invalid catalogue:\n${errors.join("\n")}`);
  return { version: raw.version as number, carryUnits: raw.carryUnits as number, items };
}

/** Reads the shops' price lists against a catalogue: every thing sold must be a thing, and every price a price. */
export function parseShops(input: unknown, catalogue: Catalogue): ShopList {
  const raw = input as { version?: unknown; shops?: unknown };
  const errors: string[] = [];
  if (!whole(raw?.version, 1, 1_000_000)) errors.push("version: a whole number from 1");
  const shops = new Map<string, { item: string; price: Mk }[]>();
  const listed = typeof raw?.shops === "object" && raw.shops !== null ? (raw.shops as Record<string, { stock?: unknown }>) : (errors.push("shops: an object"), {});
  for (const [kind, shop] of Object.entries(listed)) {
    if (!ID.test(kind)) errors.push(`shops.${kind}: lower-case letters`);
    const stock: { item: string; price: Mk }[] = [];
    for (const [n, line] of (Array.isArray(shop?.stock) ? shop.stock : (errors.push(`shops.${kind}.stock: a list`), [])).entries()) {
      const { item, price } = line as { item?: unknown; price?: unknown };
      if (typeof item !== "string" || !catalogue.items.has(item)) errors.push(`shops.${kind}.stock[${n}]: "${String(item)}" is no thing in the catalogue`);
      else if (stock.some((had) => had.item === item)) errors.push(`shops.${kind}.stock[${n}]: "${item}" is sold twice`);
      if (!whole(price, 1, 100_000_000)) errors.push(`shops.${kind}.stock[${n}].price: a whole number of Makuta from 1`);
      stock.push({ item: item as string, price: price as Mk });
    }
    shops.set(kind, stock);
  }
  if (errors.length > 0) throw new Error(`invalid shops:\n${errors.join("\n")}`);
  return { version: raw.version as number, shops };
}

export const BASE_CATALOGUE: Catalogue = parseCatalogue(itemsFile);
export const BASE_SHOPS: ShopList = parseShops(shopsFile, BASE_CATALOGUE);

/** The most of one thing in one basket line: a shop sells by the unit and the tin, not by the crate. */
export const MOST_OF_ONE = 20;

export type Priced =
  | { readonly ok: true; readonly lines: readonly { readonly item: string; readonly quantity: number; readonly price: Mk; readonly amount: Mk }[]; readonly total: Mk; readonly units: number }
  | { readonly ok: false; readonly error: "empty" | "not_sold" | "quantity" };

/** What a basket costs at a kind of shop, line by line, and how much room it takes. Lines for the same thing are added together. */
export function priceBasket(shops: ShopList, catalogue: Catalogue, shop: string, basket: readonly { readonly item: string; readonly quantity: number }[]): Priced {
  const stock = shops.shops.get(shop);
  if (!stock) return { ok: false, error: "not_sold" };
  const wanted = new Map<string, number>();
  for (const line of basket) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) return { ok: false, error: "quantity" };
    wanted.set(line.item, (wanted.get(line.item) ?? 0) + line.quantity);
  }
  if (wanted.size === 0) return { ok: false, error: "empty" };
  const lines = [];
  let total = 0;
  let units = 0;
  for (const [item, quantity] of wanted) {
    const sold = stock.find((one) => one.item === item);
    if (!sold) return { ok: false, error: "not_sold" };
    if (quantity > MOST_OF_ONE) return { ok: false, error: "quantity" };
    const amount = sold.price * quantity;
    lines.push({ item, quantity, price: sold.price, amount });
    total += amount;
    units += catalogue.items.get(item)!.size * quantity;
  }
  return { ok: true, lines, total, units };
}

/** How many units of a Mochila these things fill. A thing the catalogue no longer has takes no room. */
export function unitsCarried(catalogue: Catalogue, held: readonly { readonly item: string; readonly quantity: number }[]): number {
  return held.reduce((sum, one) => sum + (catalogue.items.get(one.item)?.size ?? 0) * one.quantity, 0);
}
