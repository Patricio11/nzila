// The accounts Makuta can sit in. Every Makuta in the game is in exactly one
// of them, and the balances of all of them always add up to zero: what the
// players hold is what the faucets have paid out less what the sinks took in.

export const ACCOUNT_KINDS = [
  "player_cash", // the carteira: on the person, at risk
  "player_bank", // safe
  "business_till",
  "escrow", // held by the game between two parties: a deposit, a stake, a contract
  "system_faucet", // where new Makuta enters the world; its balance runs negative
  "system_sink", // where Makuta leaves the world
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/**
 * The named faucets. Makuta enters the world only through these, so "how much
 * did the game pay out today, and for what" is one query. A new one is a
 * deliberate change here and in the seed.
 */
export const FAUCETS = [
  "wage", // biscatos and career shifts paid by the system
  "npc_customer", // NPCs buying from players and from player businesses
  "insurance_payout",
  "grant", // the first Makuta of a new player; a restoration by support
] as const;
export type FaucetKind = (typeof FAUCETS)[number];

/** The named sinks. Makuta leaves the world only through these. */
export const SINKS = [
  "npc_shop", // goods bought from NPC shops, stalls and dealers
  "fare",
  "rent", // to NPC landlords, for homes and lots
  "tax",
  "fuel",
  "utilities",
  "fine",
  "hospital",
  "insurance_premium",
  "fee", // licences, towing, the house's cut of a staked table
] as const;
export type SinkKind = (typeof SINKS)[number];

/** "<kind>:<ref>", for example "player_cash:p_81f3" or "system_sink:fare". */
export type AccountId = string;

export interface Account {
  readonly kind: AccountKind;
  /** The owner: a player id, a business id, an escrow id, or the faucet or sink name. */
  readonly ref: string;
}

const REF = /^[A-Za-z0-9_-]{1,64}$/;

function refIsValid(kind: AccountKind, ref: string): boolean {
  if (kind === "system_faucet") return (FAUCETS as readonly string[]).includes(ref);
  if (kind === "system_sink") return (SINKS as readonly string[]).includes(ref);
  return REF.test(ref);
}

/** Builds an account id. Throws on a reference that is not allowed for the kind. */
export function accountId(kind: AccountKind, ref: string): AccountId {
  if (!refIsValid(kind, ref)) throw new Error(`not a valid ${kind} account: ${ref}`);
  return `${kind}:${ref}`;
}

/** Reads an account id, or returns null when it is not one. */
export function parseAccountId(id: unknown): Account | null {
  if (typeof id !== "string") return null;
  const colon = id.indexOf(":");
  const kind = id.slice(0, colon) as AccountKind;
  const ref = id.slice(colon + 1);
  if (colon < 0 || !ACCOUNT_KINDS.includes(kind) || !refIsValid(kind, ref)) return null;
  return { kind, ref };
}

export function faucet(kind: FaucetKind): AccountId {
  return `system_faucet:${kind}`;
}

export function sink(kind: SinkKind): AccountId {
  return `system_sink:${kind}`;
}

export function isSystemAccount(account: Account): boolean {
  return account.kind === "system_faucet" || account.kind === "system_sink";
}

/** Every system account, for the seed. */
export function systemAccountIds(): AccountId[] {
  return [...FAUCETS.map(faucet), ...SINKS.map(sink)];
}
