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
    tops: { tshirt: BELOW_HER, blusa: BELOW_HER, alcas: BELOW_HER, vestido: ["none"] },
    hair: ["baixo", "careca", "afro", "cachos", "trancas", "bob", "puxinho", "dreads", "lenco", "bone"],
    extras: ["brincos", "oculos"],
  },
  m: {
    tops: { tshirt: BELOW_HIM, long: BELOW_HIM, alcas: BELOW_HIM },
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

/** Everything that can be worn below, in one list: what a look's `bottom` is counted in on the wire. */
const BOTTOMS = ["trousers", "shorts", "skirt", "pano", "none"];
const NOT_THERE = 255;
const at = (list: readonly string[], value: string): number => {
  const index = list.indexOf(value);
  return index < 0 ? NOT_THERE : index;
};

/**
 * A look as twelve bytes: each choice is its place in the catalogue's lists, not its name. A player's look is
 * sent to everyone who comes to see them, and as text it was two hundred bytes each time (finding F-165).
 *
 * THE LISTS ABOVE ARE THEREFORE WIRE FORMAT: new things to wear are added at the end of a list, never in the
 * middle, and nothing is taken out. A test holds the lists as they are today.
 */
export function packLook(look: Look): Uint8Array {
  const has = CATALOGUE[look.sex];
  const extras = (look.extras ?? []).reduce((bits, extra) => bits | (has.extras.includes(extra) ? 1 << has.extras.indexOf(extra) : 0), 0);
  return Uint8Array.from([
    look.sex === "f" ? 0 : 1,
    look.skin & 0xff,
    at(has.hair, look.hair),
    at(COVERS.includes(look.hair) ? COLOURS.cloth : COLOURS.hair, look.hairColour),
    at(Object.keys(has.tops), look.top),
    at(COLOURS.cloth, look.topColour),
    at(BOTTOMS, look.bottom),
    at(COLOURS.bottom, look.bottomColour),
    at(COLOURS.bands, look.bands),
    at(COLOURS.shoe, look.shoe),
    extras,
    ((look.tall ?? 0) + 1) * 3 + ((look.broad ?? 0) + 1),
  ]);
}

export const LOOK_BYTES = 12;

/** The look twelve bytes describe, when it is one the wardrobe can dress; null for anything else. They came over a wire. */
export function unpackLook(bytes: Uint8Array): Look | null {
  if (bytes.length !== LOOK_BYTES) return null;
  const [sexAt, skin, hairAt, hairColourAt, topAt, topColourAt, bottomAt, bottomColourAt, bandsAt, shoeAt, extraBits, build] = bytes as unknown as number[];
  if (sexAt! > 1 || build! > 8) return null;
  const sex = sexAt === 0 ? "f" : "m";
  const has = CATALOGUE[sex];
  const hair = has.hair[hairAt!];
  if (hair === undefined || extraBits! >= 1 << has.extras.length) return null;
  // Whatever is out of a list is undefined here, and a look with anything undefined is refused whole below.
  return checkLook({
    sex,
    skin,
    hair,
    hairColour: (COVERS.includes(hair) ? COLOURS.cloth : COLOURS.hair)[hairColourAt!],
    top: Object.keys(has.tops)[topAt!],
    topColour: COLOURS.cloth[topColourAt!],
    bottom: BOTTOMS[bottomAt!],
    bottomColour: COLOURS.bottom[bottomColourAt!],
    bands: COLOURS.bands[bandsAt!],
    shoe: COLOURS.shoe[shoeAt!],
    extras: has.extras.filter((_, n) => (extraBits! & (1 << n)) !== 0),
    tall: Math.floor(build! / 3) - 1,
    broad: (build! % 3) - 1,
  });
}
