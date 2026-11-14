// The bench: the same fixed run on every device, so numbers can be compared.
// It measures two things the game lives or dies by on a cheap phone:
//
//   1. Frames. A scene is drawn along a fixed path for a fixed time and every
//      frame is timed. The budget is 30 frames a second, sustained (Rule 1).
//   2. The simulation. A channel's worth of people and vehicles is stepped as
//      fast as the device can, to see how much of each 50 ms step it eats.
//
// The scene is whatever implements BenchScene. From Task 1.1 that is the
// game's own renderer on the test scene (render/bench-scene.ts). The 2D
// stand-in that came before it is kept (`/bench?scene=2d`) because it tells a
// slow phone from a slow renderer.

import { CELL_DRIVE, CELL_WALK, addCharacter, addVehicle, createRng, createWalkGrid, createWorld, fillCells, gridGround, rngChance, rngRange, stepWorld, type DriveInput, type MoveInput } from "@nzila/sim";

export interface BenchScene {
  readonly name: string;
  /** True when this is not the game's own renderer, so the numbers must not be read as the game's. */
  readonly standIn: boolean;
  setup(canvas: HTMLCanvasElement): void;
  /** Draws the frame at `seconds` along the fixed path. The same time always draws the same thing. */
  frame(seconds: number): void;
  dispose(): void;
}

export interface BenchResult {
  readonly scene: string;
  readonly standIn: boolean;
  readonly seconds: number;
  readonly frames: number;
  /** Frames a second over the whole run. */
  readonly fps: number;
  /**
   * The number the budget is held against: 95 frames in every 100 were at
   * least this fast. "30 frames a second, sustained" means this is 30 or more.
   */
  readonly fpsSustained: number;
  /** Frames a second in the worst one per cent of frames: what a stutter feels like. Reported, not judged. */
  readonly fpsLow: number;
  readonly worstFrameMs: number;
  /** Milliseconds one simulation step takes with 80 people and 20 vehicles. The step is 50 ms long. */
  readonly simStepMs: number;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly device: string;
  /** From the game's renderer only: the most any frame of the run needed, against 120 and 120 000 (Rule 1). */
  readonly draws?: number;
  readonly triangles?: number;
  /** The smallest height the picture was drawn at: lower than the tier's means the phone was struggling. */
  readonly drawnHeight?: number;
  /** What the graphics card calls itself. A software one makes the frame rate meaningless. */
  readonly graphics?: string;
}

export const FPS_BUDGET = 30;

/** The first half second is not counted: every browser hitches while a page settles. */
const WARM_UP_S = 0.5;

function measureFrames(scene: BenchScene, seconds: number): Promise<{ frames: number; fps: number; fpsSustained: number; fpsLow: number; worstFrameMs: number }> {
  return new Promise((done) => {
    const times: number[] = [];
    let start = 0;
    let last = 0;
    const tick = (now: number): void => {
      if (start === 0) start = now;
      else if ((now - start) / 1000 > WARM_UP_S) times.push(now - last);
      last = now;
      const elapsed = (now - start) / 1000;
      if (elapsed >= seconds + WARM_UP_S) {
        const sorted = [...times].sort((a, b) => b - a);
        const slowest = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 100)));
        const low = slowest.reduce((sum, ms) => sum + ms, 0) / slowest.length;
        const p95 = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
        const total = times.reduce((sum, ms) => sum + ms, 0);
        done({ frames: times.length, fps: (times.length * 1000) / total, fpsSustained: 1000 / p95, fpsLow: 1000 / low, worstFrameMs: sorted[0] ?? 0 });
        return;
      }
      scene.frame(elapsed);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Steps a busy channel as fast as possible and returns the milliseconds one step takes. */
export function measureSim(steps = 200): number {
  const grid = createWalkGrid(500, 0, 0, 240, 240);
  fillCells(grid, 0, 0, 239, 239, CELL_WALK | CELL_DRIVE, 0);
  const map = { ground: gridGround(grid), obstacles: [] };
  const world = createWorld(1);
  const rng = createRng(7);
  for (let id = 1; id <= 80; id++) addCharacter(world, id, { x: rngRange(rng, 5000, 115_000), y: 0, z: rngRange(rng, 5000, 115_000), yaw: 0 });
  for (let i = 0; i < 20; i++) addVehicle(world, 100 + i, i % 2 ? "van" : "car", { x: 10_000 + i * 5000, y: 0, z: 60_000, yaw: 0, speed: 0 });
  const moves = new Map<number, MoveInput>();
  const drives = new Map<number, DriveInput>();
  for (const c of world.characters) moves.set(c.id, { dx: rngRange(rng, -127, 127), dz: rngRange(rng, -127, 127), run: rngChance(rng, 300) });
  for (const v of world.vehicles) drives.set(v.id, { throttle: 100, steer: rngRange(rng, -60, 60), brake: false });
  const start = performance.now();
  for (let i = 0; i < steps; i++) stepWorld(world, map, { moves, drives });
  return (performance.now() - start) / steps;
}

export async function runBench(scene: BenchScene & { worst?: () => { draws: number; triangles: number; height: number; graphics: string } }, canvas: HTMLCanvasElement, seconds: number): Promise<BenchResult> {
  scene.setup(canvas);
  try {
    const frames = await measureFrames(scene, seconds);
    const worst = scene.worst?.();
    return {
      scene: scene.name,
      standIn: scene.standIn,
      seconds,
      ...frames,
      ...(worst ? { draws: worst.draws, triangles: worst.triangles, drawnHeight: worst.height, graphics: worst.graphics } : {}),
      simStepMs: measureSim(),
      width: canvas.width,
      height: canvas.height,
      pixelRatio: window.devicePixelRatio,
      device: navigator.userAgent,
    };
  } finally {
    scene.dispose();
  }
}
