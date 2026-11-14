// The health of the economy, read from a window of transfers. Because Makuta
// only enters through faucets and only leaves through sinks, these few sums
// say whether prices are about to run away or the world is being drained.

import { FAUCETS, SINKS, parseAccountId, type FaucetKind, type SinkKind } from "./accounts.ts";
import { type Mk, type Transfer } from "./ledger.ts";

export interface EconomyHealth {
  /** Makuta paid into the world by each faucet, net of reversals. */
  readonly faucets: Readonly<Record<FaucetKind, Mk>>;
  /** Makuta taken out of the world by each sink, net of reversals. */
  readonly sinks: Readonly<Record<SinkKind, Mk>>;
  readonly faucetTotal: Mk;
  readonly sinkTotal: Mk;
  /** Faucets less sinks: how much the money supply grew in the window. */
  readonly netIssued: Mk;
  /** Makuta that changed hands between players, businesses and escrow, not counting the system. */
  readonly volume: Mk;
  /** Everything held outside the system accounts, before and after the window. */
  readonly supplyStart: Mk;
  readonly supplyEnd: Mk;
  /** Volume as thousandths of the average supply: how many times a Makuta changed hands. */
  readonly velocityPermille: number;
  /** Growth of the supply over the window, in thousandths. Sustained growth above what players produce is inflation. */
  readonly inflationPermille: number;
}

function zeroes<K extends string>(keys: readonly K[]): Record<K, Mk> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, Mk>;
}

/** The health of the economy over a window of transfers, given the money supply when the window opened. */
export function economyHealth(transfers: readonly Transfer[], supplyStart: Mk): EconomyHealth {
  const faucets = zeroes(FAUCETS);
  const sinks = zeroes(SINKS);
  let volume = 0;
  for (const t of transfers) {
    const debit = parseAccountId(t.debitAccount)!;
    const credit = parseAccountId(t.creditAccount)!;
    let system = false;
    for (const [account, signed] of [[debit, -t.amount], [credit, t.amount]] as const) {
      if (account.kind === "system_faucet") {
        // A faucet pays by being debited; a reversal credits it back.
        faucets[account.ref as FaucetKind] -= signed;
        system = true;
      } else if (account.kind === "system_sink") {
        sinks[account.ref as SinkKind] += signed;
        system = true;
      }
    }
    if (!system) volume += t.amount;
  }
  const faucetTotal = FAUCETS.reduce((sum, kind) => sum + faucets[kind], 0);
  const sinkTotal = SINKS.reduce((sum, kind) => sum + sinks[kind], 0);
  const netIssued = faucetTotal - sinkTotal;
  const supplyEnd = supplyStart + netIssued;
  const average = (supplyStart + supplyEnd) / 2;
  return {
    faucets,
    sinks,
    faucetTotal,
    sinkTotal,
    netIssued,
    volume,
    supplyStart,
    supplyEnd,
    velocityPermille: average > 0 ? Math.round((volume * 1000) / average) : 0,
    inflationPermille: supplyStart > 0 ? Math.round((netIssued * 1000) / supplyStart) : 0,
  };
}

/** The money supply: everything held outside the system accounts. */
export function moneySupply(balances: ReadonlyMap<string, Mk>): Mk {
  let supply = 0;
  for (const [account, balance] of balances) {
    const kind = parseAccountId(account)?.kind;
    if (kind !== "system_faucet" && kind !== "system_sink") supply += balance;
  }
  return supply;
}
