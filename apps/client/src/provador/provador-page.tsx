// /provador: where a player chooses how they look (the look chooser of Task
// 1.3; Task 2.3 makes it the first thing a new player does). Body, skin,
// hair and its colour, what is worn above and below and in what colours,
// shoes. The person turns under the thumb, and what is chosen is kept on the
// device and worn in the world.
//
//   /provador                 opens on the look kept on this device, or the first one
//   /provador?hour=16.6       the light it is seen in
//   /provador?look=<json>     a look given in the address (for stills)
//   /provador?ang=30          where the camera starts

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Button, Choice, Swatches } from "@nzila/ui";
import { WORLD } from "@nzila/world/client";
import { useEffect, useRef, useState } from "preact/hooks";
import { type Person } from "../render/person.ts";
import { ground } from "../render/test-scene.ts";
import { type TierName } from "../render/tiers.ts";
import { COLOURS, FIRST_LOOK, dress, fitted, saveLook, savedLook, wardrobe, type Look, type Wardrobe } from "../render/wardrobe.ts";
import { WorldRenderer } from "../render/world-renderer.ts";
import "./provador.css";

declare global {
  interface Window {
    /** Set when the person is dressed, for the screenshots and the tests. */
    __provador?: { ready: boolean; look: Look; dressed: number };
  }
}

const css = (name: string): string => {
  const colour = (WORLD as unknown as Record<string, readonly [number, number, number] | undefined>)[name] ?? WORLD.pavement;
  return `#${colour.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
};
const skinTone = (n: number): string => `#${WORLD.skin[n]!.map((part) => part.toString(16).padStart(2, "0")).join("")}`;

export function Provador() {
  const params = new URLSearchParams(location.search);
  const canvas = useRef<HTMLCanvasElement>(null);
  const given = params.get("look");
  const [look, setLook] = useState<Look>(() => ({ ...FIRST_LOOK, ...(savedLook() ?? {}), ...(given ? (JSON.parse(given) as Partial<Look>) : {}) }));
  const [has, setHas] = useState<Wardrobe | null>(null);
  const [missing, setMissing] = useState(false);
  const view = useRef({ angle: ((Number(params.get("ang")) || 20) * Math.PI) / 180, dragging: false, lastX: 0 });
  const wanted = useRef(look);
  wanted.current = look;

  useEffect(() => {
    if (!canvas.current) return;
    const renderer = new WorldRenderer(canvas.current, (params.get("tier") ?? "normal") as TierName);
    renderer.setTime((Number(params.get("hour")) || 16.6) * 3600);
    renderer.scene.add(ground(renderer, [{ colour: WORLD.pavement, width: 40, depth: 40, x: 0, y: 0, z: 0 }]));
    let closed = false;
    let person: Person | null = null;
    let worn: Look | null = null;
    let busy = false;
    let dressed = 0;
    void wardrobe().then(
      (list) => !closed && setHas(list),
      () => !closed && setMissing(true),
    );

    let frame = 0;
    let last = 0;
    const tick = (now: number): void => {
      const elapsed = last === 0 ? 33 : now - last;
      last = now;
      // Dressed again whenever what is wanted is not what is worn; one fitting at a time.
      if (!busy && worn !== wanted.current) {
        busy = true;
        const next = wanted.current;
        dress(renderer, next).then(
          (made) => {
            busy = false;
            if (closed) return made.dispose();
            if (person) {
              renderer.scene.remove(person.root);
              person.dispose();
            }
            person = made;
            worn = next;
            renderer.scene.add(made.root);
            window.__provador = { ready: true, look: next, dressed: ++dressed };
          },
          () => {
            busy = false;
            worn = next;
            if (!closed) setMissing(true);
          },
        );
      }
      const tall = person?.height ?? 1.7;
      const upright = renderer.camera.aspect < 1;
      // Near enough to see a face and the hair, far enough for the shoes.
      const distance = upright ? 3.0 : renderer.camera.aspect < 1.4 ? 2.25 : 2.5;
      const angle = view.current.angle;
      person?.pose({ speed: 0, phase: 0, time: now / 1000 });
      renderer.camera.position.set(Math.sin(angle) * distance, 1.25, Math.cos(angle) * distance);
      renderer.camera.lookAt(0, tall * 0.53, 0);
      renderer.setFocus(0, 0, 0);
      renderer.render(elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onResize = (): void => renderer.resize();
    window.addEventListener("resize", onResize);
    return () => {
      closed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      person?.dispose();
      renderer.dispose();
    };
  }, []);

  const drag = {
    onPointerDown: (event: PointerEvent) => Object.assign(view.current, { dragging: true, lastX: event.clientX }),
    onPointerUp: () => void (view.current.dragging = false),
    onPointerLeave: () => void (view.current.dragging = false),
    onPointerMove: (event: PointerEvent) => {
      if (!view.current.dragging) return;
      view.current.angle -= (event.clientX - view.current.lastX) * 0.012;
      view.current.lastX = event.clientX;
    },
  };

  /** A change of anything; what no longer fits (a pano on him, her hair on him) becomes the nearest thing that does. */
  const change = (patch: Partial<Look>): void => setLook((now) => (has ? fitted({ ...now, ...patch }, has) : { ...now, ...patch }));
  const mine = has?.[look.sex];
  const named = (group: string, ids: readonly string[]): { id: string; label: string }[] => ids.map((id) => ({ id, label: tr.t(`look.${group}.${id}` as "look.hair.afro") }));
  const swatches = (names: readonly string[]): { id: string; label: string; colour: string }[] => names.map((id, n) => ({ id, label: tr.t("look.colour", { n: n + 1 }), colour: css(id) }));
  const done = (): void => {
    saveLook(look);
    location.assign(params.get("voltar") ?? "/andar?pack=l1");
  };

  return (
    <main class="provador n-on-dark">
      <canvas ref={canvas} class="provador-canvas" style="touch-action: none" {...drag} />
      <section class="provador-panel">
        <h1 class="provador-title">{tr.t("look.title")}</h1>
        {missing ? <p class="provador-note">{tr.t("frontdoor.building")}</p> : null}
        {mine ? (
          <>
            <Choice label={tr.t("look.sex")} options={named("sex", ["f", "m"])} value={look.sex} onChange={(sex) => change({ sex: sex as Look["sex"] })} />
            <Swatches label={tr.t("look.skin")} options={[0, 1, 2, 3, 4].map((n) => ({ id: String(n), label: tr.t("look.colour", { n: n + 1 }), colour: skinTone(n) }))} value={String(look.skin)} onChange={(skin) => change({ skin: Number(skin) })} />
            <Choice label={tr.t("look.hair")} options={named("hair", Object.keys(mine.hair))} value={look.hair} onChange={(hair) => change({ hair })} />
            {look.hair === "careca" ? null : <Swatches label={tr.t(look.hair === "lenco" ? "look.lencoColour" : "look.hairColour")} options={swatches(look.hair === "lenco" ? COLOURS.cloth : COLOURS.hair)} value={look.hairColour} onChange={(hairColour) => change({ hairColour })} />}
            <Choice label={tr.t("look.top")} options={named("top", Object.keys(mine.bodies))} value={look.top} onChange={(top) => change({ top })} />
            <Swatches label={tr.t("look.topColour")} options={swatches(COLOURS.cloth)} value={look.topColour} onChange={(topColour) => change({ topColour })} />
            {look.bottom === "none" ? null : (
              <>
                <Choice label={tr.t("look.bottom")} options={named("bottom", Object.keys(mine.bodies[look.top] ?? {}))} value={look.bottom} onChange={(bottom) => change({ bottom })} />
                <Swatches label={tr.t("look.bottomColour")} options={swatches(COLOURS.bottom)} value={look.bottomColour} onChange={(bottomColour) => change({ bottomColour })} />
              </>
            )}
            {look.bottom === "pano" ? <Swatches label={tr.t("look.bands")} options={swatches(COLOURS.bands)} value={look.bands} onChange={(bands) => change({ bands })} /> : null}
            <Swatches label={tr.t("look.shoe")} options={swatches(COLOURS.shoe)} value={look.shoe} onChange={(shoe) => change({ shoe })} />
            <div class="provador-done">
              <Button onPress={done}>{tr.t("look.done")}</Button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
