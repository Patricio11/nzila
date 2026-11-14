// The rules of money. Filled by Task 0.3. Zero runtime dependencies, always.

/** Integer Makuta. Never a float, never negative in a transfer. */
export type Mk = number;

export function isTransferAmount(value: unknown): value is Mk {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
