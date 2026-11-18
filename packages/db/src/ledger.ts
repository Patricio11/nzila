// The ledger, live (Task 4.1). Every Makuta that moves is one row in
// `ledger_transfers`, written here and nowhere else. The rules are
// `packages/economy`'s; the database holds them a second time (a balance
// cannot go below zero, a row cannot be changed, a key cannot be used twice),
// so that a mistake here is refused there.
//
// Only the API calls this (D-4.2): the zone decides that something happened
// and asks the API to record it; a phone never names an amount.

import { accountId, faucet, replayOf, validateTransfer, type AccountId, type Mk, type Transfer, type TransferError, type TransferReason, type TransferRequest } from "@nzila/economy";
import { type Sql } from "postgres";

interface Row {
  id: string;
  debit_account: string;
  credit_account: string;
  amount: string;
  reason: TransferReason;
  ref: string | null;
  action_id: string;
  province_id: string | null;
  district_id: string | null;
  reverses: string | null;
  created_at: Date;
}

const read = (row: Row): Transfer => ({
  id: row.id,
  debitAccount: row.debit_account,
  creditAccount: row.credit_account,
  amount: Number(row.amount),
  reason: row.reason,
  ref: row.ref,
  actionId: row.action_id,
  provinceId: row.province_id,
  districtId: row.district_id,
  reverses: row.reverses,
  createdAt: row.created_at.toISOString(),
});

export type Recorded = { readonly ok: true; readonly transfer: Transfer; /** True when this very transfer had been recorded before: nothing moved now. */ readonly replay: boolean } | { readonly ok: false; readonly error: TransferError };

/** What a transfer may leave out: most are about nothing in particular, nowhere in particular, and reverse nothing. */
export type NewTransfer = Pick<TransferRequest, "debitAccount" | "creditAccount" | "amount" | "reason" | "actionId"> & Partial<Pick<TransferRequest, "ref" | "provinceId" | "districtId">>;

const POSTGRES = { unique: "23505", check: "23514" } as const;
const codeOf = (error: unknown): string | undefined => (error as { code?: string }).code;

/**
 * Records one transfer, once. Asked again with the same key and the same
 * transfer (a retry, a line that dropped), it answers with the transfer as it
 * was recorded and moves nothing. The same key on a different transfer is
 * refused. An account that would be overdrawn is refused, by the rule and, if
 * two arrive at the same instant, by the database.
 *
 * A reversal is not recorded here yet: it arrives with support's tools (12.x).
 */
export async function recordTransfer(sql: Sql, asked: NewTransfer): Promise<Recorded> {
  const request: TransferRequest = { ref: null, provinceId: null, districtId: null, ...asked, reverses: null };
  const existing = async (): Promise<Transfer | undefined> => {
    const [row] = await sql<Row[]>`SELECT * FROM ledger_transfers WHERE action_id = ${request.actionId}`;
    return row ? read(row) : undefined;
  };
  const before = await existing();
  const seen = replayOf(before, request);
  if (seen === "replay") return { ok: true, transfer: before!, replay: true };
  if (seen === "conflict") return { ok: false, error: "action_id_conflict" };
  const [held] = await sql<{ balance: string }[]>`SELECT balance FROM balances WHERE account_id = ${request.debitAccount}`;
  const refused = validateTransfer(request, Number(held?.balance ?? 0));
  if (refused) return { ok: false, error: refused };
  try {
    // Inside someone else's transaction this is a step of it that can fail alone; otherwise a transaction of its own.
    const within = (sql as unknown as { savepoint?: (run: (tx: Sql) => Promise<Row>) => Promise<Row> }).savepoint;
    const atomically = (run: (tx: Sql) => Promise<Row>): Promise<Row> => (within ? within.call(sql, run) : (sql.begin(run as never) as unknown as Promise<Row>));
    const row = await atomically(async (tx) => {
      for (const id of [request.debitAccount, request.creditAccount].sort()) {
        const colon = id.indexOf(":");
        await tx`INSERT INTO ledger_accounts (id, kind, ref) VALUES (${id}, ${id.slice(0, colon)}, ${id.slice(colon + 1)}) ON CONFLICT (id) DO NOTHING`;
      }
      const [made] = await tx<Row[]>`
        INSERT INTO ledger_transfers (debit_account, credit_account, amount, reason, ref, action_id, province_id, district_id)
        VALUES (${request.debitAccount}, ${request.creditAccount}, ${request.amount}, ${request.reason}, ${request.ref}, ${request.actionId}, ${request.provinceId}, ${request.districtId})
        RETURNING *`;
      return made!;
    });
    return { ok: true, transfer: read(row), replay: false };
  } catch (error) {
    // Two with the same key at the same instant: one was recorded, and this is the other.
    if (codeOf(error) === POSTGRES.unique) {
      const now = await existing();
      return replayOf(now, request) === "replay" ? { ok: true, transfer: now!, replay: true } : { ok: false, error: "action_id_conflict" };
    }
    // Two that together would overdraw the account: the database let the first through and refused this one.
    if (codeOf(error) === POSTGRES.check) return { ok: false, error: "insufficient_funds" };
    throw error;
  }
}

export async function balanceOf(sql: Sql, account: AccountId): Promise<Mk> {
  const [row] = await sql<{ balance: string }[]>`SELECT balance FROM balances WHERE account_id = ${account}`;
  return Number(row?.balance ?? 0);
}

/** What a player holds: in the Carteira (on them, at risk) and in the Banco (safe). */
export async function walletOf(sql: Sql, playerId: string): Promise<{ cash: Mk; bank: Mk }> {
  const cash = accountId("player_cash", playerId);
  const bank = accountId("player_bank", playerId);
  const rows = await sql<{ account_id: string; balance: string }[]>`SELECT account_id, balance FROM balances WHERE account_id IN ${sql([cash, bank])}`;
  const of = (id: string): Mk => Number(rows.find((row) => row.account_id === id)?.balance ?? 0);
  return { cash: of(cash), bank: of(bank) };
}

export interface StatementLine {
  readonly id: string;
  readonly at: string;
  /** Positive when it came in, negative when it went out. */
  readonly amount: Mk;
  readonly reason: TransferReason;
  readonly ref: string | null;
  /** The other side: an account id. What it is called to a player is the caller's to say. */
  readonly other: AccountId;
}

/** The movements of one account, newest first: every line of a statement is a transfer that can be opened. */
export async function statementOf(sql: Sql, account: AccountId, limit = 50): Promise<StatementLine[]> {
  const rows = await sql<Row[]>`
    SELECT * FROM ledger_transfers WHERE debit_account = ${account} OR credit_account = ${account}
    ORDER BY created_at DESC, id DESC LIMIT ${limit}`;
  return rows.map((row) => {
    const out = row.debit_account === account;
    return { id: row.id, at: row.created_at.toISOString(), amount: out ? -Number(row.amount) : Number(row.amount), reason: row.reason, ref: row.ref, other: out ? row.credit_account : row.debit_account };
  });
}

/**
 * The first Makuta a player has: what their card of origin says, paid once from the faucet of grants into their
 * Carteira (D-4.1). The key is the player's own id, so that it can be asked for any number of times and happens once.
 */
export async function grantOrigin(sql: Sql, playerId: string, makuta: Mk, where: { provinceId?: string | null; districtId?: string | null } = {}): Promise<Recorded> {
  return recordTransfer(sql, {
    debitAccount: faucet("grant"),
    creditAccount: accountId("player_cash", playerId),
    amount: makuta,
    reason: "grant",
    ref: "origin",
    actionId: `origin:${playerId}`,
    provinceId: where.provinceId ?? null,
    districtId: where.districtId ?? null,
  });
}

export interface LedgerAudit {
  readonly ok: boolean;
  /** What every account holds, added up: zero, or Makuta has appeared or vanished. */
  readonly sum: Mk;
  readonly transfers: number;
  /** Accounts whose kept balance is not what their transfers add up to. */
  readonly wrong: { account: AccountId; kept: Mk; derived: Mk }[];
  /** Accounts below zero that are not faucets. */
  readonly overdrawn: AccountId[];
}

/**
 * The proof the ledger convention asks for, to be run every night and whenever anyone doubts: all accounts add up
 * to zero, every kept balance is what its rows say, and nothing but a faucet is below zero.
 */
export async function auditLedger(sql: Sql): Promise<LedgerAudit> {
  const [totals] = await sql<{ sum: string; transfers: string }[]>`SELECT (SELECT COALESCE(sum(balance), 0) FROM balances) AS sum, (SELECT count(*) FROM ledger_transfers) AS transfers`;
  const wrong = await sql<{ account: string; kept: string; derived: string }[]>`
    WITH moved AS (
      SELECT account, sum(amount) AS derived FROM (
        SELECT credit_account AS account, amount FROM ledger_transfers
        UNION ALL SELECT debit_account, -amount FROM ledger_transfers
      ) each GROUP BY account
    )
    SELECT COALESCE(b.account_id, m.account) AS account, COALESCE(b.balance, 0) AS kept, COALESCE(m.derived, 0) AS derived
    FROM balances b FULL JOIN moved m ON m.account = b.account_id
    WHERE COALESCE(b.balance, 0) <> COALESCE(m.derived, 0) ORDER BY 1`;
  const overdrawn = await sql<{ account_id: string }[]>`SELECT account_id FROM balances WHERE balance < 0 AND account_id NOT LIKE 'system_faucet:%' ORDER BY 1`;
  const sum = Number(totals!.sum);
  return {
    ok: sum === 0 && wrong.length === 0 && overdrawn.length === 0,
    sum,
    transfers: Number(totals!.transfers),
    wrong: wrong.map((row) => ({ account: row.account, kept: Number(row.kept), derived: Number(row.derived) })),
    overdrawn: overdrawn.map((row) => row.account_id),
  };
}
