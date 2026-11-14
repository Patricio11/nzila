// /cena: the test scene, to look at. Drag the hour to see the whole day,
// switch the quality tier, read what it costs to draw. A page for the team
// and the founder to judge the light on; its words are plain English and are
// not in the catalog.
//
//   /cena?hour=17.5&tier=poupanca&still    starts there; `still` holds the camera on one
//                                          view, which is what screenshots use
//   /cena?clock                            follows the world clock: a game day every real hour

import { ptAOTranslator as tr } from "@nzila/i18n";
import { DEFAULT_CLOCK, compileClock, gameTimeAt } from "@nzila/sim";
import { useEffect, useRef, useState } from "preact/hooks";
import { buildTestScene } from "../render/test-scene.ts";
import { runBench } from "../bench/bench.ts";
import { renderBenchScene } from "../render/bench-scene.ts";
import { rememberTier, rememberedTier } from "../render/tier-store.ts";
import { TIERS, chooseTier, type TierName } from "../render/tiers.ts";
import { WorldRenderer, type FrameCounts } from "../render/world-renderer.ts";
import "./cena.css";

const TIER_NAMES: readonly TierName[] = ["poupanca", "normal", "alta"];
const worldClock = compileClock(DEFAULT_CLOCK);

declare global {
  interface Window {
    /** Set once the first frame has been drawn, for the test harness and the screenshots. */
    __cena?: FrameCounts & { graphics: string };
  }
}

export function Cena() {
  const params = new URLSearchParams(location.search);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hour, setHour] = useState(Number(params.get("hour")) || 17.3);
  const [tier, setTier] = useState<TierName>(TIER_NAMES.includes(params.get("tier") as TierName) ? (params.get("tier") as TierName) : (rememberedTier() ?? "poupanca"));
  const [choosing, setChoosing] = useState(false);
  const followClock = params.has("clock");
  const [counts, setCounts] = useState<FrameCounts | null>(null);
  const live = useRef({ hour, renderer: null as WorldRenderer | null });
  live.current.hour = hour;

  useEffect(() => {
    if (!canvas.current || choosing) return;
    const renderer = new WorldRenderer(canvas.current, tier);
    const scene = buildTestScene(renderer);
    live.current.renderer = renderer;
    const still = params.has("still");
    let frame = 0;
    let last = 0;
    let shown = 0;
    const tick = (now: number): void => {
      const elapsed = last === 0 ? 33 : now - last;
      last = now;
      if (followClock) {
        const second = gameTimeAt(worldClock, Date.now()).secondOfDay;
        live.current.hour = second / 3600;
        if (now - shown > 500) setHour(second / 3600);
      }
      renderer.setTime(live.current.hour * 3600);
      scene.update(still ? 6 : now / 1000);
      if (still) scene.postcard();
      renderer.render(elapsed);
      const measured = renderer.counts();
      window.__cena = { ...measured, graphics: renderer.graphics };
      if (now - shown > 500) {
        shown = now;
        setCounts(measured);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onResize = (): void => renderer.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, [tier, choosing]);

  // What a phone does at first play: ten seconds at the Normal tier, then the tier that suits it.
  const chooseForThisDevice = async (): Promise<void> => {
    if (!canvas.current || choosing) return;
    setChoosing(true);
    await new Promise((done) => requestAnimationFrame(done));
    const result = await runBench(renderBenchScene("normal"), canvas.current, 10);
    const chosen = chooseTier(result, (navigator as { deviceMemory?: number }).deviceMemory);
    rememberTier(chosen);
    setTier(chosen);
    setChoosing(false);
  };

  return (
    <main class="cena">
      <canvas ref={canvas} class="cena-canvas" />
      <section class="cena-panel">
        <label class="cena-hour">
          <span class="cena-clock">{tr.clock(hour * 3600)}</span>
          <input type="range" min="0" max="24" step="0.05" value={hour} aria-label="Hour of the day" onInput={(event) => setHour(Number(event.currentTarget.value))} />
        </label>
        <div class="cena-tiers" role="group" aria-label="Quality tier">
          {TIER_NAMES.map((name) => (
            <button type="button" class={name === tier ? "cena-on" : undefined} aria-pressed={name === tier ? "true" : "false"} disabled={choosing} onClick={() => (rememberTier(name), setTier(name))}>
              {name}
            </button>
          ))}
          <button type="button" disabled={choosing} onClick={() => void chooseForThisDevice()}>
            {choosing ? "measuring, 10 s…" : "choose for this device"}
          </button>
        </div>
        {counts ? (
          <p class="cena-counts">
            {counts.draws} draw calls of 120 · {tr.number(counts.triangles)} triangles of 120.000 · drawn {counts.height} px tall of {TIERS[tier].height}
          </p>
        ) : null}
      </section>
    </main>
  );
}
