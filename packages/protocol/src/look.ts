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
