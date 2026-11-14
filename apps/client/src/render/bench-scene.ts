// The game's renderer as a bench scene: the test scene of twenty buildings,
// walked along its fixed path at golden hour. This is what the frame budget
// is measured on from Task 1.1.

import { type BenchScene } from "../bench/bench.ts";
import { buildTestScene, type TestScene } from "./test-scene.ts";
import { type TierName } from "./tiers.ts";
import { WorldRenderer, type FrameCounts } from "./world-renderer.ts";

export interface RenderBenchScene extends BenchScene {
  /** The most draw calls and triangles any frame of the run needed, and the smallest picture it was drawn at. */
  worst(): FrameCounts & { graphics: string };
}

export function renderBenchScene(tier: TierName, hour = 17.3): RenderBenchScene {
  let renderer: WorldRenderer | null = null;
  let scene: TestScene | null = null;
  let last = 0;
  let draws = 0;
  let triangles = 0;
  let height = Infinity;
  let graphics = "";

  return {
    name: `test scene, ${tier}`,
    standIn: false,
    setup(canvas) {
      renderer = new WorldRenderer(canvas, tier);
      renderer.setTime(hour * 3600);
      scene = buildTestScene(renderer);
      graphics = renderer.graphics;
      last = 0;
    },
    frame(seconds) {
      if (!renderer || !scene) return;
      scene.update(seconds);
      renderer.render(last === 0 ? 33 : (seconds - last) * 1000);
      last = seconds;
      const counts = renderer.counts();
      draws = Math.max(draws, counts.draws);
      triangles = Math.max(triangles, counts.triangles);
      height = Math.min(height, counts.height);
    },
    worst: () => ({ draws, triangles, height: Number.isFinite(height) ? height : 0, graphics }),
    dispose() {
      renderer?.dispose();
      renderer = null;
      scene = null;
    },
  };
}
