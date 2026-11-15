// The age gate (Task 2.6, D-0.10, D-0.32). Only the year of birth is asked,
// and it never leaves the phone: the client works out the band with this
// rule and the band is all that is sent or stored. Client and API share the
// rule so that they cannot disagree.

/** The two bands a player may be in. Under 15 there is no account at all. */
export type AgeBand = "15_17" | "18_plus";

export const AGE_BANDS: readonly AgeBand[] = ["15_17", "18_plus"];

/**
 * The band of someone born in `birthYear`, "young" for someone who may not
 * play yet, "invalid" for what is not a year anyone alive was born in.
 *
 * A year does not say whether the birthday has passed. Whoever turns 15 this
 * year may play; but the things kept for adults (staked tables, namoro) open
 * only to someone who is 18 whatever the month.
 */
export function ageBandOf(birthYear: number, thisYear: number): AgeBand | "young" | "invalid" {
  if (!Number.isInteger(birthYear) || birthYear > thisYear || birthYear < thisYear - 110) return "invalid";
  const turns = thisYear - birthYear;
  if (turns < 15) return "young";
  return turns - 1 >= 18 ? "18_plus" : "15_17";
}
