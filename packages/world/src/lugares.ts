// The places of a bairro that an errand may be sent to: the pack's points of interest, in its order, but for those
// that are work to be taken (`biscato-…`) or something done for the player and paid for (`servico-…`: a barbearia).
// The zone says which place a player stands at by its number in this list, the API deals the day's errands by that
// number, and the phone finds the place by it: all three must count the same way, so all three count with this
// (F-284: the phone counted one way and the zone another, and an errand was offered where it could not be done).

/** Whether a point of interest is a place errands are sent to. */
export const isErrandPlace = (id: string): boolean => !/^(biscato|servico)-/.test(id);

/** The places errands are sent to, in the pack's order. */
export function errandPlaces<T extends { readonly id: string }>(pois: readonly T[]): T[] {
  return pois.filter((one) => isErrandPlace(one.id));
}
