import { describe, expect, test } from "vitest";
import { CARGA_EDGE, CARGA_INPUTS_MAX, CARGA_LEFT, CARGA_RIGHT, CARGA_STEP_MS, TAP_GAP_MS, cargaMost, cargaRoad, cargaStart, cargaStep, scoreCarga, type CargaInput } from "./carga.ts";

const LENGTH = 90_000;

/** A steady hand: watches the stack, and taps against its lean when it leans and is still going that way. */
function steadyHand(seed: number, watchFrom = 250): { inputs: CargaInput[]; delivered: number; fallen: number } {
  const road = cargaRoad(seed, LENGTH);
  const state = cargaStart();
  const inputs: CargaInput[] = [];
  let last = -TAP_GAP_MS;
  while (state.step < LENGTH / CARGA_STEP_MS) {
    const t = state.step * CARGA_STEP_MS;
    if (t - last >= TAP_GAP_MS && state.still === 0) {
      if (state.lean > watchFrom && state.swing >= 0) inputs.push({ t, what: CARGA_LEFT });
      else if (state.lean < -watchFrom && state.swing <= 0) inputs.push({ t, what: CARGA_RIGHT });
      if (inputs.at(-1)?.t === t) last = t;
    }
    cargaStep(state, road, inputs);
  }
  return { inputs, delivered: state.delivered, fallen: state.fallen };
}

describe("levar carga (Task 4.5)", () => {
  test("the road is the same from the same seed, and bumps it every second or so, either way", () => {
    const road = cargaRoad(11, LENGTH);
    expect(cargaRoad(11, LENGTH)).toEqual(road);
    expect(cargaRoad(12, LENGTH)).not.toEqual(road);
    expect(road.length).toBeGreaterThan(50);
    expect(road.some((bump) => bump.push < 0) && road.some((bump) => bump.push > 0)).toBe(true);
  });

  test("a steady hand delivers nearly every load; with no hand the stack falls again and again", () => {
    const most = cargaMost(LENGTH);
    expect(most).toBe(7);
    for (const seed of [1, 2, 3, 4, 5]) {
      const hand = steadyHand(seed);
      expect(hand.delivered).toBeGreaterThanOrEqual(most - 1);
      // The zone, replaying the same taps, finds the same.
      expect(scoreCarga(seed, LENGTH, hand.inputs)).toEqual({ score: Math.min(1000, Math.trunc((hand.delivered * 1000) / most)), delivered: hand.delivered, fallen: hand.fallen, most });
      const none = scoreCarga(seed, LENGTH, []);
      expect(none.fallen).toBeGreaterThan(3);
      expect(none.delivered).toBeLessThan(hand.delivered);
    }
  });

  test("a stack over the edge falls, the trip begins again, and nothing moves while it is gathered up", () => {
    const state = cargaStart();
    state.lean = CARGA_EDGE;
    state.swing = 50;
    state.along = 9000;
    cargaStep(state, [], []);
    expect(state).toMatchObject({ fallen: 1, justFell: true, lean: 0, along: 0 });
    // While it is gathered up, taps do nothing.
    const before = state.step;
    cargaStep(state, [], [{ t: before * CARGA_STEP_MS, what: CARGA_RIGHT }]);
    expect(state.swing).toBe(0);
    for (let n = 0; n < 60; n++) cargaStep(state, [], []);
    expect(state.justFell).toBe(false);
    expect(state.along).toBeGreaterThan(0);
  });

  test("taps faster than a hand count once, and out of order, late or too many count for nothing", () => {
    const fast = scoreCarga(3, LENGTH, Array.from({ length: 10 }, (_, i): CargaInput => ({ t: 1000 + i * 10, what: CARGA_LEFT })));
    const once = scoreCarga(3, LENGTH, [{ t: 1000, what: CARGA_LEFT }]);
    expect(fast).toEqual(once);
    const hand = steadyHand(4);
    expect(scoreCarga(4, LENGTH, [{ t: 5000, what: CARGA_LEFT }, ...hand.inputs])).toEqual(scoreCarga(4, LENGTH, [{ t: 5000, what: CARGA_LEFT }]));
    expect(scoreCarga(4, LENGTH, [{ t: LENGTH + 1, what: CARGA_LEFT }])).toEqual(scoreCarga(4, LENGTH, []));
    const many = [...Array.from({ length: CARGA_INPUTS_MAX }, (): CargaInput => ({ t: 0, what: CARGA_LEFT })), ...hand.inputs];
    expect(scoreCarga(4, LENGTH, many).delivered).toBeLessThan(hand.delivered);
  });

  test("a round left early is replayed only as far as it was played", () => {
    const hand = steadyHand(2);
    const early = scoreCarga(2, LENGTH, hand.inputs.filter((input) => input.t < 20_000), 20_000);
    expect(early.fallen).toBe(0);
    expect(early.delivered).toBe(1);
    expect(early.most).toBe(7);
    expect(scoreCarga(2, LENGTH, [], -5)).toMatchObject({ delivered: 0, fallen: 0 });
  });

  test("a stack is never higher than seven boxes, and a short round can still deliver one", () => {
    const state = cargaStart();
    for (let n = 0; n < 10; n++) {
      state.along = 20_000;
      state.still = 0;
      cargaStep(state, [], []);
    }
    expect(state.boxes).toBe(7);
    expect(cargaMost(1000)).toBe(1);
  });
});
