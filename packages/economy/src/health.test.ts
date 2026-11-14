// Every Makuta figure in this file is a fixture.
import { expect, test } from "vitest";
import { faucet, sink } from "./accounts.ts";
import { economyHealth, moneySupply } from "./health.ts";
import { createBook, post, reversalOf, type TransferRequest } from "./ledger.ts";

const NOW = "2026-11-14T12:00:00.000Z";
let n = 0;
const move = (debitAccount: string, creditAccount: string, amount: number, reason: TransferRequest["reason"]): TransferRequest => ({
  debitAccount,
  creditAccount,
  amount,
  reason,
  ref: null,
  actionId: `h${++n}`,
  provinceId: null,
  districtId: null,
  reverses: null,
});

test("golden: a small day in the economy", () => {
  const book = createBook();
  const ok = (r: TransferRequest) => {
    const result = post(book, r, NOW);
    if (!result.ok) throw new Error(result.error);
    return result.transfer;
  };
  // Before the window: Ana already holds 4000.
  ok(move(faucet("grant"), "player_cash:ana", 4000, "grant"));
  const before = book.transfers.length;
  const supplyStart = moneySupply(book.balances);
  expect(supplyStart).toBe(4000);

  ok(move(faucet("wage"), "player_cash:ana", 1200, "wage"));
  ok(move(faucet("wage"), "player_cash:beto", 800, "wage"));
  ok(move(faucet("npc_customer"), "business_till:b1", 500, "business_sale"));
  ok(move("player_cash:ana", sink("fare"), 150, "fare"));
  const mistake = ok(move("player_cash:ana", sink("fare"), 150, "fare"));
  ok(reversalOf(mistake, "refund"));
  ok(move("player_cash:ana", sink("npc_shop"), 600, "purchase"));
  ok(move("player_cash:ana", "player_cash:beto", 1000, "p2p"));
  ok(move("player_cash:beto", "escrow:e1", 300, "stake"));
  const overpaid = ok(move(faucet("wage"), "player_cash:beto", 50, "wage"));
  ok(reversalOf(overpaid, "clawback"));

  const health = economyHealth(book.transfers.slice(before), supplyStart);
  expect(health.faucets).toEqual({ wage: 2000, npc_customer: 500, insurance_payout: 0, grant: 0 });
  expect(health.sinks).toMatchObject({ fare: 150, npc_shop: 600, tax: 0 });
  expect(health.faucetTotal).toBe(2500);
  expect(health.sinkTotal).toBe(750);
  expect(health.netIssued).toBe(1750);
  expect(health.volume).toBe(1300);
  expect(health.supplyStart).toBe(4000);
  expect(health.supplyEnd).toBe(5750);
  expect(health.supplyEnd).toBe(moneySupply(book.balances));
  expect(health.velocityPermille).toBe(267);
  expect(health.inflationPermille).toBe(438);
});

test("an empty window in an empty world is all zeroes, not a division by zero", () => {
  const health = economyHealth([], 0);
  expect(health).toMatchObject({ faucetTotal: 0, sinkTotal: 0, netIssued: 0, volume: 0, supplyEnd: 0, velocityPermille: 0, inflationPermille: 0 });
});

test("the money supply is what is held outside the system", () => {
  const balances = new Map([
    ["player_cash:ana", 700],
    ["player_bank:ana", 300],
    ["escrow:e1", 50],
    ["system_faucet:wage", -1200],
    ["system_sink:fare", 150],
  ]);
  expect(moneySupply(balances)).toBe(1050);
});
