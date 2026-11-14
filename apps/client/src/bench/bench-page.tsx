// /bench: open it on a phone, press the button, read the numbers. Made for
// the founder to run on the reference units and send back what it says.
// A page for the team, so its words are plain English and not in the catalog.
//
//   /bench             waits for the button
//   /bench?auto        starts by itself (the test harness uses this)
//   /bench?seconds=20  runs longer; the default is 10
//   /bench?tier=normal the quality tier to draw at; the default is poupanca, the reference phone's
//   /bench?scene=2d    the flat stand-in scene, to tell a slow phone from a slow renderer

import { Button, RoadMark } from "@nzila/ui";
import { useEffect, useRef, useState } from "preact/hooks";
import { FPS_BUDGET, runBench, type BenchResult, type BenchScene } from "./bench.ts";
import "./bench.css";
import { renderBenchScene } from "../render/bench-scene.ts";
import { type TierName } from "../render/tiers.ts";
import { standInScene } from "./stand-in.ts";

declare global {
  interface Window {
    /** The last result, for the test harness to read. */
    __bench?: BenchResult;
  }
}

const one = (n: number): string => n.toFixed(1);

export function Bench() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [result, setResult] = useState<BenchResult | null>(null);
  const params = new URLSearchParams(location.search);
  const seconds = Math.max(2, Math.min(120, Number(params.get("seconds")) || 10));

  const makeScene = (): BenchScene => {
    const tier = (params.get("tier") ?? "poupanca") as TierName;
    return params.get("scene") === "2d" ? standInScene() : renderBenchScene(tier === "normal" || tier === "alta" ? tier : "poupanca");
  };
  /** The scene shown while the page waits for the button: the first frame of the run, held still. */
  const preview = useRef<BenchScene | null>(null);

  const run = async (): Promise<void> => {
    if (!canvas.current || state === "running") return;
    setState("running");
    preview.current?.dispose();
    preview.current = null;
    const scene = makeScene();
    const outcome = await runBench(scene, canvas.current, seconds);
    window.__bench = outcome;
    setResult(outcome);
    setState("done");
  };

  useEffect(() => {
    if (params.has("auto")) {
      void run();
      return;
    }
    if (!canvas.current) return;
    const scene = makeScene();
    preview.current = scene;
    scene.setup(canvas.current);
    void (scene.ready?.() ?? Promise.resolve()).then(() => {
      if (preview.current === scene) scene.frame(0);
    });
    return () => {
      preview.current?.dispose();
      preview.current = null;
    };
  }, []);

  const pass = result !== null && result.fpsSustained >= FPS_BUDGET;
  const report = result
    ? [
        `Nzila bench · ${result.scene}`,
        `sustained ${one(result.fpsSustained)} fps · average ${one(result.fps)} · worst 1% ${one(result.fpsLow)} · worst frame ${one(result.worstFrameMs)} ms`,
        `sim step ${result.simStepMs.toFixed(2)} ms of 50`,
        ...(result.draws === undefined ? [] : [`draw calls ${result.draws} of 120 · triangles ${result.triangles} of 120000 · drawn ${result.drawnHeight} px tall`, `graphics: ${result.graphics}`]),
        `${result.width}x${result.height} @${result.pixelRatio}x · ${result.seconds} s · ${result.frames} frames`,
        result.device,
      ].join("\n")
    : "";

  return (
    <main class="bench">
      <canvas ref={canvas} class="bench-canvas" />
      <section class="bench-panel">
        <h1>Bench</h1>
        {state === "idle" ? <p>A fixed {seconds} second run. Close other apps first, and do not touch the screen while it runs.</p> : null}
        {state === "running" ? (
          <p class="bench-running">
            <RoadMark /> Running for {seconds} seconds…
          </p>
        ) : null}
        {result ? (
          <>
            <p class={`bench-verdict ${pass ? "bench-pass" : "bench-fail"}`}>
              <RoadMark state={pass ? "done" : "stopped"} size={28} />
              <strong>{one(result.fpsSustained)}</strong>
              <span>frames a second, sustained (95 frames in 100 were this fast or faster). The budget is {FPS_BUDGET}.</span>
            </p>
            <dl class="bench-numbers">
              <dt>Average</dt>
              <dd>{one(result.fps)} fps</dd>
              <dt>Worst 1% of frames</dt>
              <dd>{one(result.fpsLow)} fps</dd>
              <dt>Worst frame</dt>
              <dd>{one(result.worstFrameMs)} ms</dd>
              {result.draws === undefined ? null : (
                <>
                  <dt>Draw calls</dt>
                  <dd>{result.draws} of 120</dd>
                  <dt>Triangles</dt>
                  <dd>{result.triangles} of 120000</dd>
                  <dt>Picture height</dt>
                  <dd>{result.drawnHeight} px</dd>
                </>
              )}
              <dt>Simulation step</dt>
              <dd>{result.simStepMs.toFixed(2)} ms of 50</dd>
              <dt>Canvas</dt>
              <dd>
                {result.width}×{result.height} at {result.pixelRatio}×
              </dd>
            </dl>
            {result.standIn ? <p class="bench-note">This is the stand-in scene. It measures the phone, not the game. Open /bench without ?scene=2d for the real renderer.</p> : null}
            <textarea class="bench-report" readOnly rows={7} value={report} onFocus={(event) => event.currentTarget.select()} />
            <p class="bench-note">Tap the box to select the numbers, copy them, and send them.</p>
          </>
        ) : null}
        {state !== "running" ? <Button onPress={() => void run()}>{result ? "Run again" : "Start"}</Button> : null}
      </section>
    </main>
  );
}
