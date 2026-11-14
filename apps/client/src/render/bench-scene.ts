// The game's renderer as a bench scene: the development district, streamed
// as the game streams it, walked along a fixed path on its promenade at
// golden hour. This is what the frame budget is measured on.
//
// On a machine where the district has not been built (it needs Blender) the
// plain test scene of twenty boxes stands in, and the result says so in its
// name.

import { type BenchScene } from "../bench/bench.ts";
import { DistrictScene } from "./district-scene.ts";
import { buildTestScene, type TestScene } from "./test-scene.ts";
import { type TierName } from "./tiers.ts";
import { WorldRenderer, type FrameCounts } from "./world-renderer.ts";

export interface RenderBenchScene extends BenchScene {
  /** The most draw calls and triangles any frame of the run needed, and the smallest picture it was drawn at. */
  worst(): FrameCounts & { graphics: string };
}

export const DEV_PACK = "/packs/dev/";

export function renderBenchScene(tier: TierName, hour = 17.3): RenderBenchScene {
  let renderer: WorldRenderer | null = null;
  let district: DistrictScene | null = null;
  let boxes: TestScene | null = null;
  let last = 0;
  let draws = 0;
  let triangles = 0;
  let height = Infinity;
  let graphics = "";

  return {
    get name() {
      return `${boxes ? "test scene" : "development district"}, ${tier}`;
    },
    standIn: false,
    setup(canvas) {
      renderer = new WorldRenderer(canvas, tier);
      renderer.setTime(hour * 3600);
      graphics = renderer.graphics;
      last = 0;
    },
    async ready() {
      if (!renderer) return;
      const mine = renderer;
      try {
        const opened = await DistrictScene.open(mine, DEV_PACK);
        if (renderer !== mine) return opened.close();
        district = opened;
        // Everything round the start of the path is on screen before a frame is timed.
        await opened.settle();
      } catch {
        if (renderer === mine) boxes = buildTestScene(mine);
      }
    },
    frame(seconds) {
      if (!renderer) return;
      if (district) {
        district.walk(seconds);
        district.update();
      } else {
        boxes?.update(seconds);
      }
      renderer.render(last === 0 ? 33 : (seconds - last) * 1000);
      last = seconds;
      const counts = renderer.counts();
      draws = Math.max(draws, counts.draws);
      triangles = Math.max(triangles, counts.triangles);
      height = Math.min(height, counts.height);
    },
    worst: () => ({ draws, triangles, height: Number.isFinite(height) ? height : 0, graphics }),
    dispose() {
      district?.close();
      renderer?.dispose();
      renderer = null;
      district = null;
      boxes = null;
    },
  };
}
