// The rules of a Makuta movement. Money never appears or disappears by
// changing a number: every movement is one transfer from a debit account to a
// credit account, and a mistake is corrected by a second transfer that
// reverses the first. The API applies these rules in the database (Task 4.1);
// the Book below applies the same rules in memory, for tests, simulations and
// the nightly audit's arithmetic.

import { parseAccountId, type AccountId } from "./accounts.ts";

/** Integer Makuta. Never a float, never negative in a transfer. */
export type Mk = number;

/** The largest single transfer. Far above anything the game does, far below where integers stop being exact. */
export const MAX_TRANSFER: Mk = 1_000_000_000_000;

export function isTransferAmount(value: unknown): value is Mk {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_TRANSFER;
}

export const TRANSFER_REASONS = [
  "wage",
  "purchase",
  "fare",
  "rent",
  "deposit",
  "fuel",
  "fine",
  "fiance",
  "tax",
  "p2p",
  "bank_in",
  "bank_out",
  "business_sale",
  "business_wage",
  "supply",
  "insurance_premium",
  "insurance_payout",
  "theft",
  "theft_return",
  "fence",
  "kixikila",
  "hospital",
  "grant",
  "stake",
  "fee",
  "utilities",
  "errand", // a neighbour paying for an errand done (os recados do dia)
  "family", // the family's money for the taxi
] as const;
export type TransferReason = (typeof TRANSFER_REASONS)[number];

export interface TransferRequest {
  readonly debitAccount: AccountId;
  readonly creditAccount: AccountId;
  readonly amount: Mk;
  readonly reason: TransferReason;
  /** What the transfer is about: a receipt, a contract, a shift. */
  readonly ref: string | null;
  /**
   * The idempotency key: one per transfer, made by whoever asked for it. An
   * action that moves money twice (a price and its tax) uses two keys derived
   * from its own id.
   */
  readonly actionId: string;
  readonly provinceId: string | null;
  readonly districtId: string | null;
  /** The id of the transfer this one reverses, or null. */
  readonly reverses: string | null;
}

/** A transfer as recorded. Never changed, never deleted. */
export interface Transfer extends TransferRequest {
  readonly id: string;
  readonly createdAt: string;
}

export type TransferError =
  | "amount_invalid"
  | "account_invalid"
  | "same_account"
  | "action_id_invalid"
  | "reason_invalid"
  | "faucet_credit" // only a reversal may pay Makuta back into a faucet
  | "sink_debit" // only a reversal may take Makuta back out of a sink
  | "insufficient_funds"
  | "action_id_conflict" // the key was already used for a different transfer
  | "reverses_unknown"
  | "reverses_a_reversal"
  | "already_reversed"
  | "reversal_mismatch";

/**
 * Checks one transfer against the rules that need nothing but the request and
 * the balance of the account being debited. Returns null when it may go ahead.
 */
export function validateTransfer(request: TransferRequest, debitBalance: Mk): TransferError | null {
  if (!isTransferAmount(request.amount)) return "amount_invalid";
  const debit = parseAccountId(request.debitAccount);
  const credit = parseAccountId(request.creditAccount);
  if (!debit || !credit) return "account_invalid";
  if (request.debitAccount === request.creditAccount) return "same_account";
  if (typeof request.actionId !== "string" || request.actionId.length === 0 || request.actionId.length > 128) {
    return "action_id_invalid";
  }
  if (!TRANSFER_REASONS.includes(request.reason)) return "reason_invalid";
  if (request.reverses === null) {
    if (credit.kind === "system_faucet") return "faucet_credit";
    if (debit.kind === "system_sink") return "sink_debit";
  }
  // A faucet is the one account that may pay out what it does not hold.
  if (debit.kind !== "system_faucet" && debitBalance < request.amount) return "insufficient_funds";
  return null;
}

/** The request that undoes a recorded transfer: the same Makuta, back the way it came. */
export function reversalOf(original: Transfer, actionId: string): TransferRequest {
  return {
    debitAccount: original.creditAccount,
    creditAccount: original.debitAccount,
    amount: original.amount,
    reason: original.reason,
    ref: original.ref,
    actionId,
    provinceId: original.provinceId,
    districtId: original.districtId,
    reverses: original.id,
  };
}

const REQUEST_FIELDS = [
  "debitAccount",
  "creditAccount",
  "amount",
  "reason",
  "ref",
  "actionId",
  "provinceId",
  "districtId",
  "reverses",
] as const;

function sameRequest(a: TransferRequest, b: TransferRequest): boolean {
  return REQUEST_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * What to do with a request whose idempotency key may have been seen before.
 * Mobile networks drop and clients retry, so the same request arriving twice
 * is normal: it is answered with the first result and nothing moves again.
 * The same key on a different request is a bug or an attack, and is refused.
 */
export function replayOf(existing: Transfer | undefined, request: TransferRequest): "new" | "replay" | "conflict" {
  if (!existing) return "new";
  return sameRequest(existing, request) ? "replay" : "conflict";
}

/** A ledger in memory. */
export interface Book {
  readonly balances: Map<AccountId, Mk>;
  readonly transfers: Transfer[];
  readonly byActionId: Map<string, Transfer>;
  readonly byId: Map<string, Transfer>;
  /** Ids of transfers that have been reversed. */
  readonly reversed: Set<string>;
}

export type PostResult =
  | { readonly ok: true; readonly transfer: Transfer; readonly replayed: boolean }
  | { readonly ok: false; readonly error: TransferError };

export function createBook(): Book {
  return { balances: new Map(), transfers: [], byActionId: new Map(), byId: new Map(), reversed: new Set() };
}

export function balanceOf(book: Book, account: AccountId): Mk {
  return book.balances.get(account) ?? 0;
}

/** Records a transfer if the rules allow it. Either everything happens or nothing does. */
export function post(book: Book, request: TransferRequest, createdAt: string): PostResult {
  const existing = book.byActionId.get(request.actionId);
  const seen = replayOf(existing, request);
  if (existing && seen === "replay") return { ok: true, transfer: existing, replayed: true };
  if (seen === "conflict") return { ok: false, error: "action_id_conflict" };

  // A reversal is checked against its original first, so the answer says what
  // is really wrong ("already reversed") and not only that the money is gone.
  if (request.reverses !== null) {
    const original = book.byId.get(request.reverses);
    if (!original) return { ok: false, error: "reverses_unknown" };
    if (original.reverses !== null) return { ok: false, error: "reverses_a_reversal" };
    if (book.reversed.has(original.id)) return { ok: false, error: "already_reversed" };
    if (!sameRequest(reversalOf(original, request.actionId), request)) return { ok: false, error: "reversal_mismatch" };
  }

  const error = validateTransfer(request, balanceOf(book, request.debitAccount));
  if (error) return { ok: false, error };
  if (request.reverses !== null) book.reversed.add(request.reverses);

  const transfer: Transfer = { ...request, id: `t${book.transfers.length + 1}`, createdAt };
  book.transfers.push(transfer);
  book.byActionId.set(transfer.actionId, transfer);
  book.byId.set(transfer.id, transfer);
  book.balances.set(transfer.debitAccount, balanceOf(book, transfer.debitAccount) - transfer.amount);
  book.balances.set(transfer.creditAccount, balanceOf(book, transfer.creditAccount) + transfer.amount);
  return { ok: true, transfer, replayed: false };
}

export interface AuditResult {
  /** The sum of every balance. Anything but zero means Makuta was made or lost. */
  readonly sum: Mk;
  /** Accounts whose cached balance is not what their transfers add up to. */
  readonly mismatched: AccountId[];
}

/** The arithmetic of the nightly ledger audit: balances are recomputed from the transfers and compared. */
export function audit(transfers: readonly Transfer[], cachedBalances: ReadonlyMap<AccountId, Mk>): AuditResult {
  const computed = new Map<AccountId, Mk>();
  for (const t of transfers) {
    computed.set(t.debitAccount, (computed.get(t.debitAccount) ?? 0) - t.amount);
    computed.set(t.creditAccount, (computed.get(t.creditAccount) ?? 0) + t.amount);
  }
  let sum = 0;
  const mismatched: AccountId[] = [];
  for (const account of new Set([...computed.keys(), ...cachedBalances.keys()])) {
    const cached = cachedBalances.get(account) ?? 0;
    sum += cached;
    if (cached !== (computed.get(account) ?? 0)) mismatched.push(account);
  }
  return { sum, mismatched: mismatched.sort() };
}
