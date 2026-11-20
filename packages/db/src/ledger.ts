// The ledger, live (Task 4.1). Every Makuta that moves is one row in
// `ledger_transfers`, written here and nowhere else. The rules are
// `packages/economy`'s; the database holds them a second time (a balance
// cannot go below zero, a row cannot be changed, a key cannot be used twice),
// so that a mistake here is refused there.
//
// Only the API calls this (D-4.2): the zone decides that something happened
// and asks the API to record it; a phone never names an amount.

import { accountId, faucet, replayOf, reversalOf, validateTransfer, type AccountId, type Mk, type Transfer, type TransferError, type TransferReason, type TransferRequest } from "@nzila/economy";
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
export type NewTransfer = Pick<TransferRequest, "debitAccount" | "creditAccount" | "amount" | "reason" | "actionId"> & Partial<Pick<TransferRequest, "ref" | "provinceId" | "districtId" | "reverses">>;

const POSTGRES = { unique: "23505", check: "23514" } as const;
const codeOf = (error: unknown): string | undefined => (error as { code?: string }).code;

/**
 * Records one transfer, once. Asked again with the same key and the same
 * transfer (a retry, a line that dropped), it answers with the transfer as it
 * was recorded and moves nothing. The same key on a different transfer is
 * refused. An account that would be overdrawn is refused, by the rule and, if
 * two arrive at the same instant, by the database.
 *
 * A reversal is made by `reverseTransfer`, which checks it against its original.
 */
export async function recordTransfer(sql: Sql, asked: NewTransfer): Promise<Recorded> {
  const request: TransferRequest = { ref: null, provinceId: null, districtId: null, reverses: null, ...asked };
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
        INSERT INTO ledger_transfers (debit_account, credit_account, amount, reason, ref, action_id, province_id, district_id, reverses)
        VALUES (${request.debitAccount}, ${request.creditAccount}, ${request.amount}, ${request.reason}, ${request.ref}, ${request.actionId}, ${request.provinceId}, ${request.districtId}, ${request.reverses})
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

/**
 * Undoes a recorded transfer (the one with `originalActionId`): the same Makuta back the way it came, once. Asked
 * again with the same key, it answers with the reversal recorded and moves nothing; a transfer reversed already, or
 * itself a reversal, is refused.
 */
export async function reverseTransfer(sql: Sql, originalActionId: string, actionId: string): Promise<Recorded> {
  const [row] = await sql<Row[]>`SELECT * FROM ledger_transfers WHERE action_id = ${originalActionId}`;
  if (!row) return { ok: false, error: "reverses_unknown" };
  const original = read(row);
  if (original.reverses !== null) return { ok: false, error: "reverses_a_reversal" };
  const [done] = await sql<Row[]>`SELECT * FROM ledger_transfers WHERE reverses = ${original.id}`;
  if (done && done.action_id !== actionId) return { ok: false, error: "already_reversed" };
  return recordTransfer(sql, { ...reversalOf(original, actionId), reverses: original.id });
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

/** The books are proved at least this often. Asked every hour by every process that has the database; done by the first to ask when it is due. */
export const AUDIT_EVERY_HOURS = 24;

/**
 * The nightly audit (the ledger convention): proves the books and writes the result where it cannot be changed,
 * `audit_log`, as "ledger.audit". Many processes may ask; it is done once a day. Gives back what was found, or
 * null when it was not yet due. Whoever calls it raises the alarm when `ok` is false.
 */
export async function nightlyLedgerAudit(sql: Sql): Promise<LedgerAudit | null> {
  return sql.begin(async (tx) => {
    // One at a time, whoever asks: the second finds it done.
    await tx`SELECT pg_advisory_xact_lock(4101)`;
    const [done] = await tx`SELECT 1 FROM audit_log WHERE kind = 'ledger.audit' AND at > now() - make_interval(hours => ${AUDIT_EVERY_HOURS})`;
    if (done) return null;
    const said = await auditLedger(tx as unknown as Sql);
    await tx`
      INSERT INTO audit_log (actor_kind, actor_id, kind, subject_kind, subject_id, reason, meta)
      VALUES ('system', 'ledger-audit', 'ledger.audit', 'ledger', 'all', ${said.ok ? "the books balance" : "THE BOOKS DO NOT BALANCE"},
              ${tx.json({ ok: said.ok, sum: said.sum, transfers: said.transfers, wrong: said.wrong.slice(0, 50), overdrawn: said.overdrawn.slice(0, 50) } as never)})`;
    return said;
  }) as Promise<LedgerAudit | null>;
}

/** The last audit that was written down: when, and what it found. Null when the books were never proved. */
export async function lastLedgerAudit(sql: Sql): Promise<{ at: string; ok: boolean; sum: number; transfers: number; wrong: number; overdrawn: number } | null> {
  const [row] = await sql<{ at: Date; meta: { ok: boolean; sum: number; transfers: number; wrong: unknown[]; overdrawn: unknown[] } }[]>`
    SELECT at, meta FROM audit_log WHERE kind = 'ledger.audit' ORDER BY at DESC, id DESC LIMIT 1`;
  return row?.meta ? { at: row.at.toISOString(), ok: row.meta.ok, sum: row.meta.sum, transfers: row.meta.transfers, wrong: row.meta.wrong.length, overdrawn: row.meta.overdrawn.length } : null;
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

/** What a player has handed to other players in the last day, from their Carteira. */
export async function sentToday(sql: Sql, playerId: string): Promise<Mk> {
  const [row] = await sql<{ sent: string }[]>`
    SELECT COALESCE(sum(amount), 0) AS sent FROM ledger_transfers
    WHERE debit_account = ${accountId("player_cash", playerId)} AND reason = 'p2p' AND created_at > now() - interval '24 hours'`;
  return Number(row!.sent);
}

/** The newest Makuta another player handed this one, if it came in the last `seconds`: for telling them so. */
export async function lastGift(sql: Sql, playerId: string, seconds = 60): Promise<{ id: string; amount: Mk; from: string | null } | null> {
  const [row] = await sql<{ id: string; amount: string; name: string | null }[]>`
    SELECT t.id, t.amount, p.name FROM ledger_transfers t LEFT JOIN players p ON t.debit_account = 'player_cash:' || p.id::text
    WHERE t.credit_account = ${accountId("player_cash", playerId)} AND t.reason = 'p2p' AND t.created_at > now() - make_interval(secs => ${seconds})
    ORDER BY t.created_at DESC, t.id DESC LIMIT 1`;
  return row ? { id: row.id, amount: Number(row.amount), from: row.name } : null;
}

