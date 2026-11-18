// /pose: the people moving, to judge the movement on. A team page in plain English, not downloaded by players.
//
//   /pose                          four people standing still; after a few seconds each rests their arms their own way
//   /pose?pose=andar               walking on the spot (andar, correr, parado, sentar, baixo)
//   /pose?pose=sentar&rest=joelhos one way of resting, for everyone (cruzados, cintura, coxas, joelhos)
//   /pose?quem=0,3,5&ang=60        who, and from which bearing in degrees
//   /pose?t=4.2&pausa              held at that second of the stride or the rest, for stills
//   /pose?gesto=dancar             a gesture over and over

import { WORLD } from "@nzila/world/client";
import { useEffect, useRef } from "preact/hooks";
import { loadDog, type Dog } from "../render/dog.ts";
import { EMOTES, EMOTE_SECONDS, loadPerson, strideOf, type Emote, type Person, type Rest } from "../render/person.ts";
import { ground } from "../render/test-scene.ts";
import { type TierName } from "../render/tiers.ts";
import { WorldRenderer } from "../render/world-renderer.ts";
import "./cena.css";

interface Standing {
  people: { name: string; height: number; model: string; skirt: boolean; female?: boolean; animal?: string }[];
}

declare global {
  interface Window {
    /** Set when the people are posed, for the screenshots. */
    __pose?: { ready: boolean };
  }
}

const BASE = "/packs/dev-people/";
const SPEEDS: Readonly<Record<string, number>> = { andar: 2.3, correr: 5.2, parado: 0, sentar: 0, baixo: 0 };

export function Pose() {
  const params = new URLSearchParams(location.search);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const renderer = new WorldRenderer(canvas.current, (params.get("tier") ?? "normal") as TierName);
    renderer.setTime((Number(params.get("hour")) || 15) * 3600);
    const pose = params.get("pose") ?? "parado";
    const seated = pose === "sentar" || pose === "baixo";
    const seatY = pose === "baixo" ? 0.2 : 0.46;
    const who = (params.get("quem") ?? "0,1,2,5").split(",").map(Number);
    const rest = params.get("rest") as Rest | null;
    const gesture = EMOTES.find((one) => one === params.get("gesto")) ?? null;
    const held = params.has("pausa") ? Number(params.get("t")) || 0 : null;
    const gap = 1.15;
    const pieces = [{ colour: WORLD.pavement, width: 40, depth: 40, x: 0, y: 0, z: 0 }];
    // A plank to sit on, the length of the row.
    if (seated) pieces.push({ colour: WORLD.wood, width: who.length * gap + 0.4, depth: 0.42, x: 0, y: seatY, z: -0.12 });
    renderer.scene.add(ground(renderer, pieces));
    let people: (Person | Dog)[] = [];
    let closed = false;
    void (async () => {
      const list = (await (await fetch(`${BASE}pessoas.json`)).json()) as Standing;
      const loaded = await Promise.all(
        who.map(async (n, i) => {
          const one = list.people[n] ?? list.people[0]!;
          const person: Person | Dog = one.animal ? await loadDog(renderer, BASE + one.model, one.height) : await loadPerson(renderer, BASE + one.model, one.height, one.skirt, one.female === true);
          person.seed = n * 1.7;
          person.root.position.set((i - (who.length - 1) / 2) * gap, seated && !one.animal ? seatY - 0.46 * (one.height / 1.7) : 0, 0);
          renderer.scene.add(person.root);
          return person;
        }),
      );
      if (closed) return;
      people = loaded;
      window.__pose = { ready: true };
    })();

    const started = performance.now();
    let phase = 0;
    let last = 0;
    let frame = 0;
    const tick = (now: number): void => {
      const elapsed = last === 0 ? 16 : now - last;
      last = now;
      const seconds = held ?? (now - started) / 1000 + (Number(params.get("t")) || 0);
      const speed = SPEEDS[pose] ?? 0;
      const stride = strideOf(speed, 1.7, false);
      phase = held !== null ? held * Math.PI : phase + ((speed * elapsed) / 1000 / stride) * Math.PI * 2;
      // A dog's legs go round faster for the same ground: its stride is shorter.
      const dogPhase = (p: number): number => p * (1.62 / 0.62);
      for (const [i, person] of people.entries()) {
        const emote: { kind: Emote; seconds: number } | undefined = gesture ? { kind: gesture, seconds: seconds % EMOTE_SECONDS[gesture] } : undefined;
        person.pose(
          { speed, phase: "female" in person && person.height < 1 ? dogPhase(phase) : phase + i * 0.7, time: seconds + i * 0.37 },
          { sit: pose === "sentar" ? 1 : 0, low: pose === "baixo" ? 1 : 0, ...(rest ? { rest } : {}), ...(emote ? { emote } : {}) },
        );
      }
      const angle = ((Number(params.get("ang")) || 20) * Math.PI) / 180;
      const upright = renderer.camera.aspect < 1;
      const distance = (upright ? 3.2 : 2.2) * Math.max(1, who.length / 2.2);
      const lookY = seated ? 0.75 : 0.95;
      renderer.camera.position.set(Math.sin(angle) * distance, lookY + 0.35, Math.cos(angle) * distance);
      renderer.camera.lookAt(0, lookY, 0);
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
      for (const person of people) person.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <main class="cena">
      <canvas ref={canvas} class="cena-canvas" />
    </main>
  );
}
