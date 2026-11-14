// /cena: the test scene, to look at. Drag the hour to see the whole day,
// switch the quality tier, read what it costs to draw. A page for the team
// and the founder to judge the light on; its words are plain English and are
// not in the catalog.
//
//   /cena?hour=17.5&tier=poupanca&still    starts there; `still` holds the camera on one
//                                          view, which is what screenshots use
//   /cena?clock                            follows the world clock: a game day every real hour
//   /cena?pack=dev                         streams the development district instead of the test
//                                          scene, walking its streets; `&at=120,96` stands still there

import { ptAOTranslator as tr } from "@nzila/i18n";
import { DataMeter } from "@nzila/ui";
import { DEFAULT_CLOCK, compileClock, gameTimeAt } from "@nzila/sim";
import { useEffect, useRef, useState } from "preact/hooks";
import { buildTestScene } from "../render/test-scene.ts";
import { runBench } from "../bench/bench.ts";
import { dataMeter } from "../net/data-meter.ts";
import { ChunkStream, type StreamState } from "../render/chunk-stream.ts";
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
  const pack = params.get("pack");
  const [stream, setStream] = useState<StreamState | null>(null);
  const [bytes, setBytes] = useState(dataMeter.session);
  useEffect(() => dataMeter.subscribe(() => setBytes(dataMeter.session)), []);
  const [counts, setCounts] = useState<FrameCounts | null>(null);
  const live = useRef({ hour, renderer: null as WorldRenderer | null });
  live.current.hour = hour;

  useEffect(() => {
    if (!canvas.current || choosing) return;
    const renderer = new WorldRenderer(canvas.current, tier);
    const scene = pack ? null : buildTestScene(renderer);
    live.current.renderer = renderer;
    const still = params.has("still");
    // A streamed district: the viewer walks its middle street, or stands where it is told to.
    let chunks: ChunkStream | null = null;
    let closed = false;
    const fixed = params.get("at")?.split(",").map(Number);
    const place = { x: fixed?.[0] ?? 40, z: fixed?.[1] ?? 96, held: fixed !== undefined };
    window.__cenaGoto = (x, z) => Object.assign(place, { x, z, held: true });
    if (pack) {
      void ChunkStream.open(renderer, `/packs/${pack}/`).then((opened) => {
        if (closed) opened.close();
        else chunks = opened;
      });
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
      if (scene) {
        scene.update(still ? 6 : now / 1000);
        if (still) scene.postcard();
      } else {
        // Up and down the middle street at a walk, looking where it goes.
        if (!place.held) {
          const lap = (now / 1000) * 6;
          const along = lap % 432;
          place.x = 20 + (along < 216 ? along : 432 - along);
        }
        const ahead = place.held || (now / 1000) * 6 % 432 < 216 ? 1 : -1;
        renderer.camera.position.set(place.x, 1.65, place.z);
        renderer.camera.lookAt(place.x + 20 * ahead, 3, place.z + 2);
        renderer.setFocus(place.x, 0, place.z);
        chunks?.update(place.x, place.z);
      }
      renderer.render(elapsed);
      const measured = renderer.counts();
      const streamed = chunks?.state();
      window.__cena = {
        ...measured,
        graphics: renderer.graphics,
        sessionBytes: dataMeter.session,
        ...(streamed ? { stream: streamed } : {}),
        ...(chunks ? { packBytes: chunks.manifest.sizes.total } : {}),
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
      chunks?.close();
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
            {stream ? ` · ${stream.shown} of ${stream.wanted} chunks shown, ${stream.loading} on their way` : ""}
          </p>
        ) : null}
        {pack ? <DataMeter sessionBytes={bytes} monthBytes={dataMeter.month} /> : null}
      </section>
    </main>
  );
}
