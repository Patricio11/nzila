// Every Makuta figure in this file is a fixture.
import { describe, expect, test } from "vitest";
import { faucet, sink } from "./accounts.ts";
import {
  MAX_TRANSFER,
  audit,
  balanceOf,
  createBook,
  isTransferAmount,
  post,
  replayOf,
  reversalOf,
  validateTransfer,
  type Book,
  type Transfer,
  type TransferRequest,
} from "./ledger.ts";

const ANA = "player_cash:ana";
const BETO = "player_cash:beto";
const NOW = "2026-11-14T12:00:00.000Z";

let nextAction = 0;
function request(change: Partial<TransferRequest> = {}): TransferRequest {
  return {
    debitAccount: ANA,
    creditAccount: BETO,
    amount: 100,
    reason: "p2p",
    ref: null,
    actionId: `a${++nextAction}`,
    provinceId: "ao-lua",
    districtId: "ao-lua/l1",
    reverses: null,
    ...change,
  };
}

/** A book in which Ana has been paid a wage of 1000. */
function bookWithAna(): Book {
  const book = createBook();
  post(book, request({ debitAccount: faucet("wage"), creditAccount: ANA, amount: 1000, reason: "wage" }), NOW);
  return book;
}

function posted(book: Book, change: Partial<TransferRequest> = {}): Transfer {
  const result = post(book, request(change), NOW);
  if (!result.ok) throw new Error(result.error);
  return result.transfer;
}

test("a transfer amount is a positive safe integer within the limit", () => {
  expect(isTransferAmount(150)).toBe(true);
  expect(isTransferAmount(MAX_TRANSFER)).toBe(true);
  for (const bad of [0, -1, 1.5, Number.NaN, Infinity, MAX_TRANSFER + 1, Number.MAX_SAFE_INTEGER + 1, "150", null]) {
    expect(isTransferAmount(bad)).toBe(false);
  }
});

describe("validateTransfer", () => {
  test("a plain transfer with the funds behind it goes ahead", () => {
    expect(validateTransfer(request(), 100)).toBeNull();
  });

  test("each rule, in turn", () => {
    expect(validateTransfer(request({ amount: 0 }), 100)).toBe("amount_invalid");
    expect(validateTransfer(request({ amount: 10.5 }), 100)).toBe("amount_invalid");
    expect(validateTransfer(request({ debitAccount: "wallet:ana" }), 100)).toBe("account_invalid");
    expect(validateTransfer(request({ creditAccount: "nobody" }), 100)).toBe("account_invalid");
    expect(validateTransfer(request({ creditAccount: ANA }), 100)).toBe("same_account");
    expect(validateTransfer(request({ actionId: "" }), 100)).toBe("action_id_invalid");
    expect(validateTransfer(request({ actionId: "x".repeat(129) }), 100)).toBe("action_id_invalid");
    expect(validateTransfer(request({ actionId: 7 as unknown as string }), 100)).toBe("action_id_invalid");
    expect(validateTransfer(request({ reason: "gift" as never }), 100)).toBe("reason_invalid");
    expect(validateTransfer(request(), 99)).toBe("insufficient_funds");
  });

  test("a faucet may pay what it does not hold; nobody else may", () => {
    expect(validateTransfer(request({ debitAccount: faucet("wage"), reason: "wage" }), -5000)).toBeNull();
    expect(validateTransfer(request({ debitAccount: "escrow:e1" }), 0)).toBe("insufficient_funds");
    expect(validateTransfer(request({ debitAccount: "business_till:b1" }), 0)).toBe("insufficient_funds");
    expect(validateTransfer(request({ debitAccount: "player_bank:ana" }), 0)).toBe("insufficient_funds");
  });

  test("Makuta flows out of faucets and into sinks, and only a reversal goes the other way", () => {
    expect(validateTransfer(request({ creditAccount: sink("fare"), reason: "fare" }), 100)).toBeNull();
    expect(validateTransfer(request({ creditAccount: faucet("wage") }), 100)).toBe("faucet_credit");
    expect(validateTransfer(request({ debitAccount: sink("fare") }), 100)).toBe("sink_debit");
    expect(validateTransfer(request({ creditAccount: faucet("wage"), reverses: "t1" }), 100)).toBeNull();
    expect(validateTransfer(request({ debitAccount: sink("fare"), reverses: "t1" }), 100)).toBeNull();
    expect(validateTransfer(request({ debitAccount: sink("fare"), reverses: "t1" }), 50)).toBe("insufficient_funds");
  });
});

describe("the book", () => {
  test("a transfer moves the amount from one account to the other and is recorded", () => {
    const book = bookWithAna();
    const result = post(book, request({ amount: 300, ref: "receipt-9" }), NOW);
    expect(result).toMatchObject({ ok: true, replayed: false, transfer: { id: "t2", amount: 300, createdAt: NOW, ref: "receipt-9" } });
    expect(balanceOf(book, ANA)).toBe(700);
    expect(balanceOf(book, BETO)).toBe(300);
    expect(balanceOf(book, faucet("wage"))).toBe(-1000);
    expect(balanceOf(book, "player_cash:nobody")).toBe(0);
    expect(book.transfers.length).toBe(2);
  });

  test("a refused transfer changes nothing", () => {
    const book = bookWithAna();
    expect(post(book, request({ amount: 1001 }), NOW)).toEqual({ ok: false, error: "insufficient_funds" });
    expect(balanceOf(book, ANA)).toBe(1000);
    expect(balanceOf(book, BETO)).toBe(0);
    expect(book.transfers.length).toBe(1);
  });

  test("nobody can spend into the negative, one Makuta at a time or all at once", () => {
    const book = bookWithAna();
    expect(post(book, request({ amount: 1000 }), NOW).ok).toBe(true);
    expect(post(book, request({ amount: 1 }), NOW)).toEqual({ ok: false, error: "insufficient_funds" });
    expect(balanceOf(book, ANA)).toBe(0);
  });
});

describe("idempotency", () => {
  test("the same request twice moves the money once and answers the same both times", () => {
    const book = bookWithAna();
    const fare = request({ creditAccount: sink("fare"), amount: 150, reason: "fare" });
    const first = post(book, fare, NOW);
    const again = post(book, { ...fare }, "2026-11-14T12:00:05.000Z");
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(again).toMatchObject({ ok: true, replayed: true, transfer: { id: "t2", createdAt: NOW } });
    expect(balanceOf(book, ANA)).toBe(850);
    expect(book.transfers.length).toBe(2);
  });

  test("a replay is answered even when the money has since been spent", () => {
    const book = bookWithAna();
    const all = request({ amount: 1000 });
    post(book, all, NOW);
    expect(post(book, all, NOW)).toMatchObject({ ok: true, replayed: true });
  });

  test("the same key on a different request is refused, whichever field differs", () => {
    const book = bookWithAna();
    const original = request({ amount: 100 });
    post(book, original, NOW);
    const changes: Partial<TransferRequest>[] = [{ amount: 900 }, { creditAccount: "player_cash:carla" }, { reason: "fare" }, { ref: "x" }, { districtId: null }];
    for (const change of changes) {
      expect(post(book, { ...original, ...change }, NOW)).toEqual({ ok: false, error: "action_id_conflict" });
    }
    expect(balanceOf(book, ANA)).toBe(900);
  });

  test("replayOf", () => {
    const book = bookWithAna();
    const original = request();
    expect(replayOf(undefined, original)).toBe("new");
    const transfer = posted(book, original);
    expect(replayOf(transfer, original)).toBe("replay");
    expect(replayOf(transfer, { ...original, amount: 1 })).toBe("conflict");
  });
});

describe("reversal", () => {
  test("a reversal sends the same Makuta back the way it came and points at the original", () => {
    const book = bookWithAna();
    const original = posted(book, { amount: 400, ref: "receipt-1" });
    const undo = reversalOf(original, "undo-1");
    expect(undo).toMatchObject({ debitAccount: BETO, creditAccount: ANA, amount: 400, reason: "p2p", ref: "receipt-1", reverses: original.id });
    expect(post(book, undo, NOW)).toMatchObject({ ok: true, transfer: { reverses: original.id } });
    expect(balanceOf(book, ANA)).toBe(1000);
    expect(balanceOf(book, BETO)).toBe(0);
    // The original is still there, unchanged.
    expect(book.transfers.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  test("a fare can be refunded from its sink, a wage returned to its faucet", () => {
    const book = bookWithAna();
    const fare = posted(book, { creditAccount: sink("fare"), amount: 150, reason: "fare" });
    expect(post(book, reversalOf(fare, "refund-1"), NOW).ok).toBe(true);
    expect(balanceOf(book, sink("fare"))).toBe(0);
    const wage = book.transfers[0]!;
    expect(post(book, reversalOf(wage, "clawback-1"), NOW).ok).toBe(true);
    expect(balanceOf(book, faucet("wage"))).toBe(0);
    expect(balanceOf(book, ANA)).toBe(0);
  });

  test("a transfer is reversed at most once, and a reversal is never reversed", () => {
    const book = bookWithAna();
    const original = posted(book, { amount: 400 });
    const undo = posted(book, reversalOf(original, "undo-1"));
    expect(post(book, reversalOf(original, "undo-2"), NOW)).toEqual({ ok: false, error: "already_reversed" });
    expect(post(book, reversalOf(undo, "undo-3"), NOW)).toEqual({ ok: false, error: "reverses_a_reversal" });
    expect(balanceOf(book, ANA)).toBe(1000);
  });

  test("a reversal must mirror its original exactly", () => {
    const book = bookWithAna();
    const original = posted(book, { amount: 400 });
    const undo = reversalOf(original, "undo-1");
    expect(post(book, { ...undo, amount: 399 }, NOW)).toEqual({ ok: false, error: "reversal_mismatch" });
    expect(post(book, { ...undo, creditAccount: "player_cash:carla" }, NOW)).toEqual({ ok: false, error: "reversal_mismatch" });
    expect(post(book, { ...undo, reverses: "t999" }, NOW)).toEqual({ ok: false, error: "reverses_unknown" });
    expect(book.reversed.size).toBe(0);
  });

  test("Makuta already spent cannot be taken back by a reversal: that needs a decision, not arithmetic", () => {
    const book = bookWithAna();
    const original = posted(book, { amount: 400 });
    posted(book, { debitAccount: BETO, creditAccount: sink("npc_shop"), amount: 400, reason: "purchase" });
    expect(post(book, reversalOf(original, "undo-1"), NOW)).toEqual({ ok: false, error: "insufficient_funds" });
    expect(book.reversed.size).toBe(0);
  });
});

describe("audit", () => {
  test("a book that was only ever posted to is clean", () => {
    const book = bookWithAna();
    posted(book, { amount: 250 });
    posted(book, { creditAccount: sink("fare"), amount: 150, reason: "fare" });
    expect(audit(book.transfers, book.balances)).toEqual({ sum: 0, mismatched: [] });
  });

  test("a balance changed behind the ledger's back is found", () => {
    const book = bookWithAna();
    posted(book, { amount: 250 });
    const tampered = new Map(book.balances);
    tampered.set(BETO, 9999);
    tampered.set("player_bank:ghost", 5);
    expect(audit(book.transfers, tampered)).toEqual({ sum: 9999 - 250 + 5, mismatched: ["player_bank:ghost", BETO] });
    // A balance missing from the cache is a mismatch too.
    const missing = new Map(book.balances);
    missing.delete(ANA);
    expect(audit(book.transfers, missing).mismatched).toEqual([ANA]);
  });
});

test("property: no sequence of requests, valid or not, makes or loses a single Makuta", () => {
  // A small seeded generator, so a failure can be replayed.
  let seed = 20261114;
  const rand = (n: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return Math.floor(((seed >>> 0) / 4294967296) * n);
  };
  const accounts = [
    ...["ana", "beto", "carla", "dino"].flatMap((p) => [`player_cash:${p}`, `player_bank:${p}`]),
    "business_till:b1",
    "escrow:e1",
    faucet("wage"),
    faucet("npc_customer"),
    faucet("grant"),
    sink("fare"),
    sink("npc_shop"),
    sink("tax"),
  ];
  const pick = (): string => accounts[rand(accounts.length)]!;
  const amounts = [1, 7, 150, 999, 5000, 0, -3, 2.5];
  const book = createBook();
  let accepted = 0;
  let refused = 0;
  for (let i = 0; i < 10_000; i++) {
    let candidate: TransferRequest;
    const roll = rand(10);
    if (roll === 0 && book.transfers.length > 0) {
      candidate = reversalOf(book.transfers[rand(book.transfers.length)]!, `p${i}`);
    } else if (roll === 1 && book.transfers.length > 0) {
      candidate = { ...book.transfers[rand(book.transfers.length)]!, amount: amounts[rand(amounts.length)]! };
    } else {
      candidate = request({ debitAccount: pick(), creditAccount: pick(), amount: amounts[rand(amounts.length)]!, actionId: `p${i}` });
    }
    const result = post(book, candidate, NOW);
    if (result.ok) accepted++;
    else refused++;

    let sum = 0;
    for (const [account, balance] of book.balances) {
      sum += balance;
      // Only a faucet is ever below zero.
      if (!account.startsWith("system_faucet:")) expect(balance).toBeGreaterThanOrEqual(0);
    }
    expect(sum).toBe(0);
  }
  // The run exercised both paths thoroughly, and the audit agrees with the running check.
  expect(accepted).toBeGreaterThan(2000);
  expect(refused).toBeGreaterThan(2000);
  expect(book.reversed.size).toBeGreaterThan(50);
  expect(audit(book.transfers, book.balances)).toEqual({ sum: 0, mismatched: [] });
}, 30_000);
