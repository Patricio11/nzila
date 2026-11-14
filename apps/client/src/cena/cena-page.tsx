// /cena: the world, to look at. Drag the hour to see the whole day, switch
// the quality tier, read what it costs to draw and to download. A page for
// the team and the founder to judge the look on; its words are plain English
// and are not in the catalog.
//
// It shows the development district (`pnpm pack:dev`), streamed as the game
// streams it. Where that has not been built, the plain test scene stands in.
//
//   /cena                                  strolls the promenade
//   /cena?hour=17.5&tier=poupanca&still    starts there; `still` holds one view, for screenshots
//   /cena?at=120,96&look=160,90            stands at a spot (x,z or x,z,eye height) looking at another
//   /cena?clock                            follows the world clock: a game day every real hour
//   /cena?pack=other                       another pack served under /packs/
//   /cena?scene=test                       the test scene of boxes

import { ptAOTranslator as tr } from "@nzila/i18n";
import { DataMeter } from "@nzila/ui";
import { DEFAULT_CLOCK, compileClock, gameTimeAt } from "@nzila/sim";
import { useEffect, useRef, useState } from "preact/hooks";
import { buildTestScene, type TestScene } from "../render/test-scene.ts";
import { DistrictScene } from "../render/district-scene.ts";
import { runBench } from "../bench/bench.ts";
import { dataMeter } from "../net/data-meter.ts";
import { type StreamState } from "../render/chunk-stream.ts";
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
    __cena?: FrameCounts & { graphics: string; stream?: StreamState; sessionBytes?: number; packBytes?: { poupanca: number; normal: number; alta: number } };
    /** Moves the viewer to a place in a streamed district, in metres. */
    __cenaGoto?: (x: number, z: number) => void;
  }
}

export function Cena() {
  const params = new URLSearchParams(location.search);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hour, setHour] = useState(Number(params.get("hour")) || 17.3);
  const [tier, setTier] = useState<TierName>(TIER_NAMES.includes(params.get("tier") as TierName) ? (params.get("tier") as TierName) : (rememberedTier() ?? "poupanca"));
  const [choosing, setChoosing] = useState(false);
  const followClock = params.has("clock");
  const pack = params.get("pack") ?? "dev";
  const [stream, setStream] = useState<StreamState | null>(null);
  const [bytes, setBytes] = useState(dataMeter.session);
  useEffect(() => dataMeter.subscribe(() => setBytes(dataMeter.session)), []);
  const [counts, setCounts] = useState<FrameCounts | null>(null);
  const live = useRef({ hour, renderer: null as WorldRenderer | null });
  live.current.hour = hour;

  useEffect(() => {
    if (!canvas.current || choosing) return;
    const renderer = new WorldRenderer(canvas.current, tier);
    live.current.renderer = renderer;
    const still = params.has("still");
    let boxes: TestScene | null = null;
    let district: DistrictScene | null = null;
    let closed = false;
    const numbers = (name: string): number[] | undefined => params.get(name)?.split(",").map(Number);
    const asked = numbers("at");
    let spot = asked;
    const look = numbers("look");
    window.__cenaGoto = (x, z) => void (spot = [x, z]);
    if (params.get("scene") === "test") {
      boxes = buildTestScene(renderer);
    } else {
      DistrictScene.open(renderer, `/packs/${pack}/`).then(
        (opened) => {
          if (closed) opened.close();
          else district = opened;
        },
        () => {
          // No such pack on this machine: the boxes are better than a blank page.
          if (!closed) boxes = buildTestScene(renderer);
        },
      );
    }
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
      if (boxes) {
        boxes.update(still ? 6 : now / 1000);
        if (still) boxes.postcard();
      } else if (district) {
        if (spot) district.stand(spot, spot === asked ? look : undefined);
        else if (still) district.postcard();
        else district.stroll(now / 1000);
        district.update();
      }
      renderer.render(elapsed);
      const measured = renderer.counts();
      const streamed = district?.state();
      window.__cena = {
        ...measured,
        graphics: renderer.graphics,
        sessionBytes: dataMeter.session,
        ...(streamed ? { stream: streamed } : {}),
        ...(district ? { packBytes: district.manifest.sizes.total } : {}),
      };
      if (now - shown > 500) {
        shown = now;
        setCounts(measured);
        setStream(streamed ?? null);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onResize = (): void => renderer.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      closed = true;
      district?.close();
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
            {counts.draws} draw calls (budget 120) · {tr.number(counts.triangles)} triangles (budget 120.000) · picture {counts.height} px tall{counts.height < TIERS[tier].height ? `, lowered from ${TIERS[tier].height} to keep up` : ""}
            {stream ? ` · ${stream.shown} of ${stream.wanted} chunks shown, ${stream.loading} on their way` : ""}
          </p>
        ) : null}
        {stream ? <DataMeter sessionBytes={bytes} monthBytes={dataMeter.month} /> : null}
      </section>
    </main>
  );
}
