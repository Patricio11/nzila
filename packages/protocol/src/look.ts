// What a player looks like, as data (D-2.1). The client proposes a look, the
// API records it: this is the catalogue both read, so the look chooser can
// offer nothing the server would refuse, and the server keeps nothing the
// wardrobe cannot dress. The wardrobe itself (art/scripts/make_wardrobe.py)
// is checked against this list by a test of the client.

/** Everything a player chose. Colours are names of the world's palette. */
export interface Look {
  readonly sex: "f" | "m";
  /** 0 to 4. */
  readonly skin: number;
  readonly hair: string;
  readonly hairColour: string;
  readonly top: string;
  readonly topColour: string;
  /** "none" under a dress. */
  readonly bottom: string;
  readonly bottomColour: string;
  /** The second colour of a pano. */
  readonly bands: string;
  readonly shoe: string;
  /** What is worn on the face and the ears: "brincos", "oculos", "barba", "bigode". */
  readonly extras?: readonly string[];
  /** -1 shorter, 0, 1 taller; and -1 slighter, 0, 1 broader. */
  readonly tall?: number;
  readonly broad?: number;
}

/** The colours offered for each thing. Few and chosen: a wardrobe, not a paint shop. */
export const COLOURS = {
  hair: ["hairBlack", "hairBrown", "hairCopper", "hairRed", "hairBlond", "hairGrey"],
  cloth: ["paintWhite", "clothBlack", "awningRed", "awningGold", "awningTeal", "zincBlue", "vanBlue", "person1", "person3", "person4", "khaki", "jeans"],
  bottom: ["jeans", "jeansDark", "clothBlack", "khaki", "paintWhite", "awningRed", "awningTeal", "zincBlue", "person2", "awningGold"],
  bands: ["awningGold", "paintWhite", "clothBlack", "cloth", "awningRed"],
  shoe: ["shoe", "shoeWhite", "shoeTan", "clothBlack"],
} as const;

/** Hair that is a cloth: its colour is a cloth's. */
export const COVERS: readonly string[] = ["lenco", "bone"];

interface Sex {
  /** What is worn above, and what may be worn below with it. */
  readonly tops: Readonly<Record<string, readonly string[]>>;
  readonly hair: readonly string[];
  readonly extras: readonly string[];
}

const BELOW_HER = ["trousers", "shorts", "skirt", "pano"];
const BELOW_HIM = ["trousers", "shorts"];

/** What there is to wear, by sex. */
export const CATALOGUE: Readonly<Record<"f" | "m", Sex>> = {
  f: {
    tops: { tshirt: BELOW_HER, blusa: BELOW_HER, alcas: BELOW_HER, vestido: ["none"], camisa: BELOW_HER, camisola: BELOW_HER, fato: BELOW_HER },
    hair: ["baixo", "careca", "afro", "cachos", "trancas", "bob", "puxinho", "dreads", "lenco", "bone"],
    extras: ["brincos", "oculos"],
  },
  m: {
    tops: { tshirt: BELOW_HIM, long: BELOW_HIM, alcas: BELOW_HIM, camisa: BELOW_HIM, camisola: BELOW_HIM, fato: BELOW_HIM },
    hair: ["baixo", "careca", "afro", "galo", "dreads", "trancas", "bone"],
    extras: ["barba", "bigode", "oculos", "brincos"],
  },
};

const KEYS = new Set(["sex", "skin", "hair", "hairColour", "top", "topColour", "bottom", "bottomColour", "bands", "shoe", "extras", "tall", "broad"]);
const within = (list: readonly string[], value: unknown): value is string => typeof value === "string" && list.includes(value);
const step = (value: unknown): value is number => value === -1 || value === 0 || value === 1;

/**
 * The look, when it is one the wardrobe can dress; null otherwise. Nothing is
 * repaired: a look with one thing wrong is refused whole, and a field this
 * list does not know is a thing wrong.
 */
export function checkLook(input: unknown): Look | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const given = input as Record<string, unknown>;
  if (Object.keys(given).some((key) => !KEYS.has(key))) return null;
  if (given.sex !== "f" && given.sex !== "m") return null;
  const has = CATALOGUE[given.sex];
  const below = typeof given.top === "string" && Object.hasOwn(has.tops, given.top) ? has.tops[given.top]! : null;
  const extras = given.extras ?? [];
  const tall = given.tall ?? 0;
  const broad = given.broad ?? 0;
  if (!below || !within(below, given.bottom) || !within(has.hair, given.hair)) return null;
  if (!Number.isInteger(given.skin) || (given.skin as number) < 0 || (given.skin as number) > 4) return null;
  if (!within(COVERS.includes(given.hair) ? COLOURS.cloth : COLOURS.hair, given.hairColour)) return null;
  if (!within(COLOURS.cloth, given.topColour) || !within(COLOURS.bottom, given.bottomColour) || !within(COLOURS.bands, given.bands) || !within(COLOURS.shoe, given.shoe)) return null;
  if (!Array.isArray(extras) || extras.some((extra) => !within(has.extras, extra)) || new Set(extras).size !== extras.length) return null;
  if (!step(tall) || !step(broad)) return null;
  return { sex: given.sex, skin: given.skin as number, hair: given.hair, hairColour: given.hairColour, top: given.top as string, topColour: given.topColour, bottom: given.bottom, bottomColour: given.bottomColour, bands: given.bands, shoe: given.shoe, extras: extras as string[], tall, broad };
}

/**
 * A look for someone who has not chosen one yet, so that a street of newcomers is a street of different
 * people and not of one person many times. Made from the catalogue by a number (the same number, the same
 * person, on every phone), and always one the wardrobe can dress. The hair is its natural dark, mostly.
 */
export function arrivalLook(seed: number): Look {
  let s = seed >>> 0;
  const pick = <T>(list: readonly T[]): T => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return list[(s >>> 8) % list.length]!;
  };
  const sex = pick(["f", "m"] as const);
  const has = CATALOGUE[sex];
  const top = pick(Object.keys(has.tops));
  const hair = pick(has.hair);
  return {
    sex,
    skin: pick([0, 1, 2, 3, 4]),
    hair,
    hairColour: COVERS.includes(hair) ? pick(COLOURS.cloth) : pick(["hairBlack", "hairBlack", "hairBlack", "hairBrown"]),
    top,
    topColour: pick(COLOURS.cloth),
    bottom: pick(has.tops[top]!),
    bottomColour: pick(COLOURS.bottom),
    bands: pick(COLOURS.bands),
    shoe: pick(COLOURS.shoe),
  };
}

// ---------------------------------------------------------------- A look on the wire

/**
 * Every thing a look can name has its own number on the wire, given once and never changed, never given to
 * another thing (the founder, 2026-11-18: the wardrobe must be free to grow and be rearranged). The order things
 * are shown in is the catalogue's above, and may change as freely as their names in the catalog of words. A new
 * thing takes the next number; a thing taken out keeps its number, unused, for ever.
 */
export const WIRE_IDS = {
  hair: { baixo: 0, careca: 1, afro: 2, cachos: 3, trancas: 4, bob: 5, puxinho: 6, dreads: 7, lenco: 8, bone: 9, galo: 10 },
  top: { tshirt: 0, blusa: 1, alcas: 2, vestido: 3, long: 4, camisa: 5, camisola: 6, fato: 7 },
  bottom: { trousers: 0, shorts: 1, skirt: 2, pano: 3, none: 4 },
  colour: {
    paintWhite: 0, clothBlack: 1, awningRed: 2, awningGold: 3, awningTeal: 4, zincBlue: 5, vanBlue: 6, person1: 7, person3: 8, person4: 9, khaki: 10, jeans: 11,
    jeansDark: 12, person2: 13, cloth: 14, hairBlack: 15, hairBrown: 16, hairCopper: 17, hairRed: 18, hairBlond: 19, hairGrey: 20, shoe: 21, shoeWhite: 22, shoeTan: 23,
  },
  /** Each extra is a bit of its own. */
  extra: { brincos: 0, oculos: 1, barba: 2, bigode: 3 },
} as const satisfies Record<string, Readonly<Record<string, number>>>;

const NOT_THERE = 255;
const idOf = (table: Readonly<Record<string, number>>, value: string): number => table[value] ?? NOT_THERE;
const nameOf = (table: Readonly<Record<string, number>>, id: number): string | undefined => Object.keys(table).find((name) => table[name] === id);

/**
 * A look as twelve bytes: each choice by its own number (WIRE_IDS), not its name. A player's look is sent to
 * everyone who comes to see them, and as text it was two hundred bytes each time (finding F-165).
 */
export function packLook(look: Look): Uint8Array {
  const extras = (look.extras ?? []).reduce((bits, extra) => bits | (extra in WIRE_IDS.extra ? 1 << WIRE_IDS.extra[extra as keyof typeof WIRE_IDS.extra] : 0), 0);
  return Uint8Array.from([
    look.sex === "f" ? 0 : 1,
    look.skin & 0xff,
    idOf(WIRE_IDS.hair, look.hair),
    idOf(WIRE_IDS.colour, look.hairColour),
    idOf(WIRE_IDS.top, look.top),
    idOf(WIRE_IDS.colour, look.topColour),
    idOf(WIRE_IDS.bottom, look.bottom),
    idOf(WIRE_IDS.colour, look.bottomColour),
    idOf(WIRE_IDS.colour, look.bands),
    idOf(WIRE_IDS.colour, look.shoe),
    extras,
    ((look.tall ?? 0) + 1) * 3 + ((look.broad ?? 0) + 1),
  ]);
}

export const LOOK_BYTES = 12;

/**
 * The look twelve bytes describe. They came over a wire, perhaps from a phone with a newer wardrobe than this
 * one: anything this phone does not have is drawn as the nearest thing it does (a cap it has never seen is the
 * short hair beneath it), so a stranger is always drawn, and never as somebody else. Null only for bytes that
 * cannot be a look at all.
 */
export function unpackLook(bytes: Uint8Array): Look | null {
  if (bytes.length !== LOOK_BYTES) return null;
  const [sexAt, skin, hairId, hairColourId, topId, topColourId, bottomId, bottomColourId, bandsId, shoeId, extraBits, build] = bytes as unknown as number[];
  if (sexAt! > 1 || build! > 8) return null;
  const sex = sexAt === 0 ? "f" : "m";
  const has = CATALOGUE[sex];
  const named = (table: Readonly<Record<string, number>>, id: number, offered: readonly string[], otherwise: string): string => {
    const name = nameOf(table, id);
    return name !== undefined && offered.includes(name) ? name : otherwise;
  };
  const hair = named(WIRE_IDS.hair, hairId!, has.hair, "baixo");
  const tops = Object.keys(has.tops);
  const top = named(WIRE_IDS.top, topId!, tops, tops[0]!);
  const below = has.tops[top]!;
  return checkLook({
    sex,
    skin: skin! <= 4 ? skin! : 0,
    hair,
    hairColour: named(WIRE_IDS.colour, hairColourId!, COVERS.includes(hair) ? COLOURS.cloth : COLOURS.hair, (COVERS.includes(hair) ? COLOURS.cloth : COLOURS.hair)[0]!),
    top,
    topColour: named(WIRE_IDS.colour, topColourId!, COLOURS.cloth, COLOURS.cloth[0]),
    bottom: named(WIRE_IDS.bottom, bottomId!, below, below[0]!),
    bottomColour: named(WIRE_IDS.colour, bottomColourId!, COLOURS.bottom, COLOURS.bottom[0]),
    bands: named(WIRE_IDS.colour, bandsId!, COLOURS.bands, COLOURS.bands[0]),
    shoe: named(WIRE_IDS.colour, shoeId!, COLOURS.shoe, COLOURS.shoe[0]),
    extras: has.extras.filter((extra) => (extraBits! & (1 << WIRE_IDS.extra[extra as keyof typeof WIRE_IDS.extra])) !== 0),
    tall: Math.floor(build! / 3) - 1,
    broad: (build! % 3) - 1,
  });
}
