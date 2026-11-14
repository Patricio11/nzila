import { expect, test } from "vitest";
import { FAUCETS, SINKS, accountId, faucet, isSystemAccount, parseAccountId, sink, systemAccountIds } from "./accounts.ts";

test("an account id is its kind and its owner", () => {
  expect(accountId("player_cash", "p_81f3")).toBe("player_cash:p_81f3");
  expect(parseAccountId("player_cash:p_81f3")).toEqual({ kind: "player_cash", ref: "p_81f3" });
  expect(parseAccountId("escrow:stake-0042")).toEqual({ kind: "escrow", ref: "stake-0042" });
});

test("a faucet or a sink must be one of the named ones", () => {
  expect(faucet("wage")).toBe("system_faucet:wage");
  expect(sink("fare")).toBe("system_sink:fare");
  expect(parseAccountId("system_sink:fare")).toEqual({ kind: "system_sink", ref: "fare" });
  expect(parseAccountId("system_faucet:fare")).toBeNull();
  expect(parseAccountId("system_sink:wage")).toBeNull();
  expect(() => accountId("system_faucet", "free_money")).toThrow();
});

test("what is not an account id is refused", () => {
  const bad = ["", "player_cash", "player_cash:", "wallet:p1", "player_cash:has space", "player_cash:a:b", `player_bank:${"x".repeat(65)}`, 7, null, undefined];
  for (const id of bad) expect(parseAccountId(id)).toBeNull();
  expect(() => accountId("player_cash", "no/slash")).toThrow();
});

test("system accounts are the faucets and the sinks, each once", () => {
  const ids = systemAccountIds();
  expect(ids.length).toBe(FAUCETS.length + SINKS.length);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(isSystemAccount(parseAccountId(id)!)).toBe(true);
  expect(isSystemAccount(parseAccountId("business_till:b1")!)).toBe(false);
});
