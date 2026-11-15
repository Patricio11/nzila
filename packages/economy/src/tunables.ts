// Tunables: every number of the game that someone may want to change without
// shipping code. Prices, fares, caps, timers and weights live in a versioned
// data file (tunables/base.json), are edited through the Estúdio (Task 4.6)
// and are checked by the validator here before anything loads them.
//
// The description below is the single source for both the TypeScript type and
// the validator, so the two cannot drift apart. A tunable is a whole number
// inside a range; amounts are Makuta, shares are thousandths.

interface Range {
  readonly min: number;
  readonly max: number;
}
type Spec = { readonly [key: string]: Range | Spec };
type Shape<S> = { readonly [K in keyof S]: S[K] extends Range ? number : Shape<S[K]> };

const range = (min: number, max: number): Range => ({ min, max });
const MK = range(0, 1_000_000_000);
const PERMILLE = range(0, 1000);

const SPEC = {
  /** Raised by one on every change, so a record says which numbers were live. */
  version: range(1, 1_000_000),
  player: {
    /** Makuta a new player arrives with, from the grant faucet. */
    startingCash: MK,
  },
  fares: {
    /** One corrida on a candongueiro inside a district. */
    candongueiroLocal: MK,
  },
  transfers: {
    /** An account younger than this many days is new. */
    newAccountDays: range(0, 365),
    /** The most a new account may send to other players in a day, stakes included. */
    newAccountDailyCap: MK,
    /** The same for every other account. */
    dailyCap: MK,
  },
  stakes: {
    /** The most one player may put on one table game. */
    perGameCap: MK,
    /** The house's cut of a staked game, to the fee sink. */
    houseCutPermille: PERMILLE,
  },
  needs: {
    /** Points of a 10 000 point bar lost per real hour of play. */
    fomePerHour: range(0, 100_000),
    energiaPerHour: range(0, 100_000),
    /** More Energia lost per real hour of going fast (running, jogging, a fast walk), and what one jump costs (D-0.46). */
    energiaPerRunHour: range(0, 100_000),
    energiaPerJump: range(0, 1000),
  },
  crime: {
    /** A player is shielded until they have played this many hours and the account is this many days old (Rule 6). */
    shieldPlayHours: range(0, 1000),
    shieldAccountDays: range(0, 365),
    /** An assalto takes at most this share of the cash on hand, and at most the ceiling. */
    assaltoPermilleOfCash: PERMILLE,
    assaltoCeiling: MK,
    /** A home can be burgled once in this many hours, for at most this share of its movable value. */
    burglaryCooldownHours: range(1, 720),
    burglaryPermilleOfMovableValue: PERMILLE,
    /** Stolen goods stay "quente", and return to the owner if the thief is caught, for this long. */
    hotGoodsHours: range(1, 720),
    maxSentenceMinutes: range(1, 120),
  },
  heat: {
    /** How much each input counts toward the heat of a block. */
    darkness: PERMILLE,
    lighting: PERMILLE,
    crowd: PERMILLE,
    police: PERMILLE,
    recentOffences: PERMILLE,
  },
} satisfies Spec;

export type Tunables = Shape<typeof SPEC>;

export type TunablesResult =
  | { readonly ok: true; readonly tunables: Tunables }
  | { readonly ok: false; readonly errors: string[] };

function isRange(node: Range | Spec): node is Range {
  return typeof node.min === "number";
}

function check(spec: Spec, value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${path || "tunables"}: expected an object`);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [key, node] of Object.entries(spec)) {
    const at = path ? `${path}.${key}` : key;
    const child = record[key];
    if (!isRange(node)) check(node, child, at, errors);
    else if (child === undefined) errors.push(`${at}: missing`);
    else if (typeof child !== "number" || !Number.isInteger(child)) errors.push(`${at}: expected a whole number`);
    else if (child < node.min || child > node.max) errors.push(`${at}: ${child} is outside ${node.min} to ${node.max}`);
  }
  for (const key of Object.keys(record)) {
    if (!Object.hasOwn(spec, key)) errors.push(`${path ? `${path}.${key}` : key}: not a known tunable`);
  }
}

/** Checks a tunables file. Reports every problem at once, not only the first. */
export function validateTunables(input: unknown): TunablesResult {
  const errors: string[] = [];
  check(SPEC, input, "", errors);
  if (errors.length > 0) return { ok: false, errors };
  const tunables = input as Tunables;
  // Rules between numbers. A cap that a smaller cap makes unreachable is a mistake someone should hear about.
  if (tunables.transfers.newAccountDailyCap > tunables.transfers.dailyCap) {
    errors.push("transfers.newAccountDailyCap: a new account may not send more than an established one");
  }
  if (tunables.stakes.perGameCap > tunables.transfers.dailyCap) {
    errors.push("stakes.perGameCap: one stake may not be larger than the daily cap it counts against");
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, tunables };
}

/** The same check for callers that cannot go on without tunables. */
export function parseTunables(input: unknown): Tunables {
  const result = validateTunables(input);
  if (!result.ok) throw new Error(`invalid tunables:\n${result.errors.join("\n")}`);
  return result.tunables;
}
