// /bench: open it on a phone, press the button, read the numbers. Made for
// the founder to run on the reference units and send back what it says.
// A page for the team, so its words are plain English and not in the catalog.
//
//   /bench             waits for the button
//   /bench?auto        starts by itself (the test harness uses this)
//   /bench?seconds=20  runs longer; the default is 10

import { Button, RoadMark } from "@nzila/ui";
import { useEffect, useRef, useState } from "preact/hooks";
import { FPS_BUDGET, runBench, type BenchResult } from "./bench.ts";
import "./bench.css";
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

  const run = async (): Promise<void> => {
    if (!canvas.current || state === "running") return;
    setState("running");
    const outcome = await runBench(standInScene(), canvas.current, seconds);
    window.__bench = outcome;
    setResult(outcome);
    setState("done");
  };

  useEffect(() => {
    if (params.has("auto")) void run();
  }, []);

  const pass = result !== null && result.fpsSustained >= FPS_BUDGET;
  const report = result
    ? [
        `Nzila bench · ${result.scene}`,
        `sustained ${one(result.fpsSustained)} fps · average ${one(result.fps)} · worst 1% ${one(result.fpsLow)} · worst frame ${one(result.worstFrameMs)} ms`,
        `sim step ${result.simStepMs.toFixed(2)} ms of 50`,
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
              <dt>Simulation step</dt>
              <dd>{result.simStepMs.toFixed(2)} ms of 50</dd>
              <dt>Canvas</dt>
              <dd>
                {result.width}×{result.height} at {result.pixelRatio}×
              </dd>
            </dl>
            {result.standIn ? <p class="bench-note">This is the stand-in scene. It measures the phone and the harness, not the game: the 3D world replaces it in Task 1.1.</p> : null}
            <textarea class="bench-report" readOnly rows={5} value={report} onFocus={(event) => event.currentTarget.select()} />
            <p class="bench-note">Tap the box to select the numbers, copy them, and send them.</p>
          </>
        ) : null}
        {state !== "running" ? <Button onPress={() => void run()}>{result ? "Run again" : "Start"}</Button> : null}
      </section>
    </main>
  );
}
