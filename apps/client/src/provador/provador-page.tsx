// /provador: where a player chooses how they look (the look chooser of Task
// 1.3; Task 2.3 makes it the first thing a new player does). Body, skin,
// hair and its colour, what is worn above and below and in what colours,
// shoes. The person turns under the thumb, and what is chosen is kept on the
// device and worn in the world.
//
//   /provador                 opens on the look kept on this device, or the first one
//   /provador?hour=16.6       the light it is seen in
//   /provador?look=<json>     a look given in the address (for stills)
//   /provador?ang=30          where the camera starts; &perto looks at the face

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Button, Choice, Swatches, Toggle } from "@nzila/ui";
import { WORLD } from "@nzila/world/client";
import { useEffect, useRef, useState } from "preact/hooks";
import { DirectionalLight } from "three";
import { type Person } from "../render/person.ts";
import { ground } from "../render/test-scene.ts";
import { type TierName } from "../render/tiers.ts";
import { COLOURS, FIRST_LOOK, dress, fitted, saveLook, savedLook, takePhoto, wardrobe, type Look, type Wardrobe } from "../render/wardrobe.ts";
import { WorldRenderer } from "../render/world-renderer.ts";
import { account, pushLook } from "../world/account.ts";
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

/** The photograph for the BI: how far the camera stands from the face, and the hour whose light it is taken in. */
const PORTRAIT_M = 0.46;
const PORTRAIT_HOUR = 15.5;
/** How strong the photographer's light is, beside a sun of about 3. */
const PORTRAIT_FLASH = 2.2;
/** The light that goes round with the camera in the chooser, beside a sun of about 3. */
const MIRROR_LIGHT = 2.1;
/** The five skins from the lightest to the darkest: the order they are offered in (their numbers are the wardrobe's and do not change). */
const SKINS_IN_ORDER = [...WORLD.skin.keys()].sort((a, b) => WORLD.skin[b]!.reduce((sum, part) => sum + part, 0) - WORLD.skin[a]!.reduce((sum, part) => sum + part, 0));

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
  // Set when the player is done: the next frame is drawn as a portrait and kept for the BI.
  const portrait = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const renderer = new WorldRenderer(canvas.current, (params.get("tier") ?? "normal") as TierName);
    renderer.setTime((Number(params.get("hour")) || 16.6) * 3600);
    // The ground, and a mat in the cloth's colours to stand on: black, yellow, red, and a square of black in the middle.
    renderer.scene.add(
      ground(renderer, [
        { colour: WORLD.pavement, width: 40, depth: 40, x: 0, y: 0, z: 0 },
        { colour: WORLD.clothBlack, width: 2.6, depth: 2.6, x: 0, y: 0.004, z: 0 },
        { colour: WORLD.adBoard, width: 2.34, depth: 2.34, x: 0, y: 0.008, z: 0 },
        { colour: WORLD.awningRed, width: 2.08, depth: 2.08, x: 0, y: 0.012, z: 0 },
        { colour: WORLD.clothBlack, width: 1.1, depth: 1.1, x: 0, y: 0.016, z: 0 },
      ]),
    );
    // A light that goes round with the camera, as in a tailor's mirror: whichever way the person is turned,
    // what is being chosen is seen, and a face is never in its own shade (as the portrait learnt, F-119).
    const mirror = new DirectionalLight(undefined, MIRROR_LIGHT);
    renderer.scene.add(mirror, mirror.target);
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
      const near = params.has("perto");
      const distance = near ? 0.72 : upright ? 3.0 : renderer.camera.aspect < 1.4 ? 2.25 : 2.5;
      const angle = view.current.angle;
      person?.pose({ speed: 0, phase: 0, time: now / 1000 });
      renderer.camera.position.set(Math.sin(angle) * distance, near ? tall * 0.96 : 1.25, Math.cos(angle) * distance);
      renderer.camera.lookAt(0, near ? tall * 0.94 : tall * 0.53, 0);
      mirror.position.copy(renderer.camera.position);
      mirror.target.position.set(0, tall * 0.6, 0);
      renderer.setFocus(0, 0, 0);
      renderer.render(elapsed);
      if (portrait.current && !busy) {
        const taken = portrait.current;
        portrait.current = null;
        if (person && canvas.current) {
          // The face, near, a little from one side, in the light of mid afternoon: as a photograph for a document is taken.
          renderer.setTime(PORTRAIT_HOUR * 3600);
          renderer.camera.position.set(Math.sin(0.35) * PORTRAIT_M, tall * 0.94, Math.cos(0.35) * PORTRAIT_M);
          renderer.camera.lookAt(0, tall * 0.925, 0);
          // A photographer's light, from where the camera stands, for this one picture: without it a face
          // is lit only from above and behind and sits in its own shade, the darker skins most of all (finding F-119).
          mirror.visible = false;
          const flash = new DirectionalLight(undefined, PORTRAIT_FLASH);
          flash.position.copy(renderer.camera.position);
          flash.target.position.set(0, tall * 0.925, 0);
          renderer.scene.add(flash, flash.target);
          renderer.render(0);
          takePhoto(canvas.current);
          mirror.visible = true;
          renderer.scene.remove(flash, flash.target);
          flash.dispose();
        }
        taken();
      }
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
      mirror.dispose();
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
  const covered = look.hair === "lenco" || look.hair === "bone";
  const sizes = (of: "tall" | "broad"): { id: string; label: string }[] => [-1, 0, 1].map((n) => ({ id: String(n), label: tr.t(`look.${of}.${look.sex}.${n + 1}` as "look.tall.f.0") }));
  const [saving, setSaving] = useState(false);
  /** Kept on the device, proposed to the server, and on: to the card of origin for someone who has none, to the world otherwise. */
  const done = async (): Promise<void> => {
    setSaving(true);
    saveLook(look);
    await new Promise<void>((taken) => {
      portrait.current = taken;
      // A page in the background draws no frames: go on without the photograph.
      window.setTimeout(taken, 1500);
    });
    const onward = params.get("voltar") ?? "/andar?pack=l1";
    const recorded = await pushLook(look);
    location.assign(recorded && !account()?.origin ? `/origem?voltar=${encodeURIComponent(onward)}` : onward);
  };

  return (
    <main class="provador n-on-dark">
      <canvas ref={canvas} class="provador-canvas" style="touch-action: none" {...drag} />
      <section class="provador-panel">
        <i class="n-pano-faixa n-pano-faixa-vermelha provador-edge" aria-hidden="true" />
        <h1 class="provador-title">{tr.t("look.title")}</h1>
        {missing ? <p class="provador-note">{tr.t("frontdoor.building")}</p> : null}
        {mine ? (
          <>
            <Choice label={tr.t("look.sex")} options={named("sex", ["f", "m"])} value={look.sex} onChange={(sex) => change({ sex: sex as Look["sex"] })} />
            <Swatches label={tr.t("look.skin")} options={SKINS_IN_ORDER.map((skin, n) => ({ id: String(skin), label: tr.t("look.colour", { n: n + 1 }), colour: skinTone(skin) }))} value={String(look.skin)} onChange={(skin) => change({ skin: Number(skin) })} />
            <Choice label={tr.t("look.hair")} options={named("hair", Object.keys(mine.hair))} value={look.hair} onChange={(hair) => change({ hair })} />
            {look.hair === "careca" ? null : <Swatches label={tr.t(covered ? "look.lencoColour" : "look.hairColour")} options={swatches(covered ? COLOURS.cloth : COLOURS.hair)} value={look.hairColour} onChange={(hairColour) => change({ hairColour })} />}
            <div class="provador-extras" role="group" aria-label={tr.t("look.extras")}>
              <span class="n-choice-label">{tr.t("look.extras")}</span>
              {Object.keys(mine.extras ?? {}).map((extra) => (
                <Toggle label={tr.t(`look.extra.${extra}` as "look.extra.oculos")} on={(look.extras ?? []).includes(extra)} onChange={(on) => change({ extras: on ? [...(look.extras ?? []), extra] : (look.extras ?? []).filter((worn) => worn !== extra) })} />
              ))}
            </div>
            <Choice label={tr.t("look.tall")} options={sizes("tall")} value={String(look.tall ?? 0)} onChange={(tall) => change({ tall: Number(tall) })} />
            <Choice label={tr.t("look.broad")} options={sizes("broad")} value={String(look.broad ?? 0)} onChange={(broad) => change({ broad: Number(broad) })} />
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
              <Button onPress={() => void done()} busy={saving}>
                {tr.t("look.done")}
              </Button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
