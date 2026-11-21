import { bolaAt } from "@nzila/protocol/bola";
import { describe, expect, test } from "vitest";
import { AFTER_GOAL_MS, BolaDoCampo, FORGOTTEN_MS, MATCH_TO, OFF_PITCH_MS, type Kicker } from "./bola.ts";

// A pitch of forty metres by twenty-six, its goals 2,6 m either side of the middle of each short end.
const CAMPO = { x0: 0, z0: 0, x1: 40_000, z1: 26_000, goal: 2600 };
const body = (id: number, x: number, z: number, vx: number, vz: number): Kicker => ({ id, playerId: `p${id}`, x, z, vx, vz });

describe("the ball on the campo, as the zone keeps it", () => {
  test("it begins in the middle and stays there until somebody kicks it; standing beside it, or walking away from it, is not a kick", () => {
    const bola = new BolaDoCampo(CAMPO, 0);
    expect(bola.state).toMatchObject({ x: 20_000, z: 13_000, vx: 0, vz: 0 });
    expect(bola.step(1000, [body(1, 19_600, 13_000, 0, 0)]).moved).toBe(false);
    expect(bola.step(1100, [body(1, 19_600, 13_000, -1400, 0)]).moved).toBe(false);
    expect(bola.step(1200, [body(1, 15_000, 13_000, 4000, 0)]).moved).toBe(false);
  });

  test("walked into, it goes the way the walker was going, faster than they were; run into, faster still; and the same foot does not kick twice at once", () => {
    const walked = new BolaDoCampo(CAMPO, 0);
    expect(walked.step(1000, [body(1, 19_600, 13_000, 1400, 0)]).moved).toBe(true);
    expect(walked.state).toMatchObject({ x: 20_000, z: 13_000, vz: 0, atMs: 1000 });
    expect(walked.state.vx).toBe(1400 * 1.5 + 2600);
    expect(walked.step(1100, [body(1, 19_700, 13_000, 1400, 0)]).moved).toBe(false);
    const run = new BolaDoCampo(CAMPO, 0);
    run.step(1000, [body(2, 19_800, 12_800, 3000, 3000)]);
    expect(run.state.vx).toBe(run.state.vz);
    expect(Math.hypot(run.state.vx, run.state.vz)).toBeGreaterThan(walked.state.vx);
    // Of two within reach, the nearer kicks.
    const two = new BolaDoCampo(CAMPO, 0);
    two.step(1000, [body(1, 19_400, 13_000, 2000, 0), body(2, 20_300, 13_000, -2000, 0)]);
    expect(two.state.vx).toBeLessThan(0);
  });

  test("it comes back off the long sides and off the short ends beside the posts, slower", () => {
    const bola = new BolaDoCampo(CAMPO, 0);
    bola.step(1000, [body(1, 20_000, 12_600, 0, 5000)]);
    const sent = bola.state.vz;
    let bounced = false;
    for (let t = 1050; t < 6000 && !bounced; t += 50) bounced = bola.step(t, []).moved;
    expect(bounced).toBe(true);
    expect(bola.state.z).toBe(26_000);
    expect(bola.state.vz).toBeLessThan(0);
    expect(Math.abs(bola.state.vz)).toBeLessThan(sent);
    // Toward a short end, wide of the posts.
    const wide = new BolaDoCampo(CAMPO, 0);
    wide.state = { x: 38_000, z: 3000, vx: 6000, vz: 0, atMs: 0 };
    let back = { moved: false, golo: null as unknown };
    for (let t = 50; t < 3000 && !back.moved; t += 50) back = wide.step(t, []);
    expect([back.golo, wide.state.x, wide.state.vx < 0]).toEqual([null, 40_000, true]);
  });

  test("between the posts it is a goal for whoever kicked it last, counted; the ball lies in the net a moment and is put back in the middle", () => {
    const bola = new BolaDoCampo(CAMPO, 0);
    bola.step(1000, [body(7, 35_600, 13_000, 5000, 0)]);
    // Not there yet: the kick was from the middle.
    bola.state = { x: 36_000, z: 13_400, vx: 8000, vz: 0, atMs: 1000 };
    bola.step(1001, [body(7, 35_500, 13_400, 5000, 0)]);
    let scored = null as { id: number; playerId: string; total: number } | null;
    for (let t = 1050; t < 4000 && !scored; t += 50) scored = bola.step(t, []).golo;
    expect(scored).toEqual({ id: 7, playerId: "p7", total: 1, lado: 0, placar: [0, 0], fim: false });
    expect(bola.state.x).toBe(40_500);
    // Nothing kicks it in the net; then it is in the middle again, still.
    const then = bola.state.atMs;
    expect(bola.step(then + 100, [body(8, 40_300, 13_400, 3000, 0)]).moved).toBe(false);
    expect(bola.step(then + AFTER_GOAL_MS, []).moved).toBe(true);
    expect(bolaAt(bola.state, then + AFTER_GOAL_MS + 1000)).toEqual({ x: 20_000, z: 13_000, vx: 0, vz: 0 });
    // A second from the same foot is two; and all of it is forgotten when the campo has stood empty.
    bola.state = { x: 1000, z: 13_000, vx: -7000, vz: 0, atMs: then + AFTER_GOAL_MS };
    bola.step(then + AFTER_GOAL_MS + 1, [body(7, 1500, 13_000, -5000, 0)]);
    let again = null as { total: number } | null;
    for (let t = then + AFTER_GOAL_MS + 50; t < then + AFTER_GOAL_MS + 3000 && !again; t += 50) again = bola.step(t, []).golo;
    expect(again?.total).toBe(2);
    bola.step(then + AFTER_GOAL_MS + 3000 + AFTER_GOAL_MS, []);
    bola.step(then + FORGOTTEN_MS * 2, []);
    expect(bola.golos.size).toBe(0);
  });

  test("a ball nobody has kicked is nobody's goal: it comes back", () => {
    const bola = new BolaDoCampo(CAMPO, 0);
    bola.state = { x: 39_500, z: 13_000, vx: 4000, vz: 0, atMs: 0 };
    let out = { moved: false, golo: null as unknown };
    for (let t = 50; t < 2000 && !out.moved; t += 50) out = bola.step(t, []);
    expect([out.golo, bola.state.vx < 0]).toEqual([null, true]);
  });

  test("sides (D-11.11): whoever steps onto the pitch joins the side with fewer; beside it one is on no side; off it a while, one has left", () => {
    const bola = new BolaDoCampo(CAMPO, 0);
    const on = (id: number, x: number): Kicker => ({ ...body(id, x, 5000, 0, 0), on: true });
    expect(bola.step(100, [on(1, 5000), body(9, 5000, -2000, 0, 0)]).lados).toEqual([{ id: 1, lado: 1 }]);
    expect(bola.jogo).toBe(false);
    expect(bola.step(200, [on(1, 5000), on(2, 30_000)]).lados).toEqual([{ id: 2, lado: 2 }]);
    expect(bola.jogo).toBe(true);
    expect(bola.step(300, [on(1, 5000), on(2, 30_000), on(3, 8000)]).lados).toEqual([{ id: 3, lado: 1 }]);
    expect(bola.step(400, [on(1, 5000), on(2, 30_000), on(3, 8000), on(4, 9000)]).lados).toEqual([{ id: 4, lado: 2 }]);
    // Told once, not at every step.
    expect(bola.step(500, [on(1, 5000), on(2, 30_000), on(3, 8000), on(4, 9000)]).lados).toEqual([]);
    // Two walk off: when they have been gone long enough they are on no side, and with one side empty it is no match.
    expect(bola.step(500 + OFF_PITCH_MS, [on(1, 5000), on(3, 8000)]).lados).toEqual([]);
    expect(bola.step(600 + OFF_PITCH_MS, [on(1, 5000), on(3, 8000)]).lados).toEqual([{ id: 2, lado: 0 }, { id: 4, lado: 0 }]);
    expect(bola.jogo).toBe(false);
  });

  test("a match: a goal at the east end is the amarelos' and at the west end the vermelhos', whoever kicked it; the first to three wins and the count begins again", () => {
    const bola = new BolaDoCampo(CAMPO, 0);
    let t = 0;
    const both = (extra: Kicker[] = []): Kicker[] => [{ ...body(1, 5000, 5000, 0, 0), on: true }, { ...body(2, 30_000, 5000, 0, 0), on: true }, ...extra];
    /** One of them runs the ball into an end; says the goal. */
    const score = (kicker: number, east: boolean) => {
      // The ball is back in the middle.
      for (; bola.state.x !== 20_000 || bola.state.vx !== 0; t += 50) bola.step(t, both());
      for (let n = 0; n < 400; n++, t += 50) {
        const at = bolaAt(bola.state, t);
        const { golo } = bola.step(t, both([{ ...body(kicker + 10, at.x + (east ? -400 : 400), 13_000, east ? 4000 : -4000, 0), playerId: `p${kicker}`, on: true }]));
        if (golo) return golo;
      }
      throw new Error("no goal");
    };
    bola.step(t, both());
    expect(score(1, true)).toMatchObject({ playerId: "p1", total: 1, lado: 1, placar: [1, 0], fim: false });
    // The amarelos' own player puts it in the west end: it is the vermelhos'.
    expect(score(1, false)).toMatchObject({ playerId: "p1", total: 2, lado: 2, placar: [1, 1], fim: false });
    expect(score(2, false)).toMatchObject({ lado: 2, placar: [1, 2], fim: false });
    expect(score(2, false)).toMatchObject({ lado: 2, placar: [1, MATCH_TO], fim: true });
    // Won: when the ball is put back the count begins again.
    for (let n = 0; n <= AFTER_GOAL_MS / 50 + 1; n++, t += 50) bola.step(t, both());
    expect(bola.placar).toEqual([0, 0]);
    expect(score(1, true)).toMatchObject({ lado: 1, placar: [1, 0], fim: false });
  });
});
