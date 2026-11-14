// /andar: one person walking the development district. The body is moved by
// the game's own rules (packages/sim: the same step the zone will run), the
// camera follows at street level, and the stick or the keyboard steers.
// A page for the team and the founder; its words are plain English.
//
//   /andar                 walk with the left thumb (or W A S D, Shift to run); drag to look round
//   /andar?quem=3          which of the people to be
//   /andar?auto            walks, runs and stops by itself, for films
//   /andar?cam=120         where the camera starts, in degrees round the person
//   /andar?hour=17.3&tier=normal

import { CELL_DRIVE, CELL_WALK, CELL_WATER, DEFAULT_CHARACTER, SIM_STEP_MS, stepCharacter, type CharacterState, type Ground } from "@nzila/sim";
import { useEffect, useRef, useState } from "preact/hooks";
import { DEV_PACK } from "../render/bench-scene.ts";
import { DistrictScene } from "../render/district-scene.ts";
import { loadPerson, type Person } from "../render/person.ts";
import { type TierName } from "../render/tiers.ts";
import { WorldRenderer } from "../render/world-renderer.ts";
import "../cena/cena.css";
import "./andar.css";

interface Standing {
  people: { name: string; height: number; model: string; skirt: boolean }[];
}

declare global {
  interface Window {
    /** For the films and the tests: where the person is and how fast they are going. */
    __andar?: { x: number; z: number; speed: number; ready: boolean };
  }
}

const PEOPLE = "/packs/dev-people/";
/** Cells a camera may sit over: anything a person or a vehicle can be on, and open water. */
const OPEN = CELL_WALK | CELL_DRIVE | CELL_WATER;

export function Andar() {
  const params = new URLSearchParams(location.search);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!canvas.current) return;
    const element = canvas.current;
    const renderer = new WorldRenderer(element, (params.get("tier") ?? "normal") as TierName);
    renderer.setTime((Number(params.get("hour")) || 16.8) * 3600);
    const auto = params.has("auto");
    let closed = false;
    let district: DistrictScene | null = null;
    let person: Person | null = null;
    const state: CharacterState = { x: 0, y: 0, z: 0, yaw: 0 };
    const before = { x: 0, y: 0, z: 0 };
    const input = { x: 0, y: 0, run: false };
    const keys = new Set<string>();
    const camera = { yaw: ((Number(params.get("cam")) || 0) * Math.PI) / 180, pitch: 0.2, distance: 4.4 };
    let facing = 0;
    let phase = 0;
    let speed = 0;
    let carried = 0;

    void (async () => {
      try {
        const [opened, list] = await Promise.all([DistrictScene.open(renderer, DEV_PACK), fetch(`${PEOPLE}pessoas.json`).then((r) => r.json() as Promise<Standing>)]);
        const who = list.people[Number(params.get("quem")) || 0] ?? list.people[0]!;
        const loaded = await loadPerson(renderer, PEOPLE + who.model, who.height, who.skirt);
        if (closed) return opened.close();
        const spawn = opened.manifest.spawns[0]!.pos;
        Object.assign(state, { x: Math.round(spawn[0] * 1000), y: Math.round(spawn[1] * 1000), z: Math.round(spawn[2] * 1000) });
        Object.assign(before, state);
        opened.stand([spawn[0], spawn[2]]);
        await opened.settle();
        if (closed) return opened.close();
        renderer.scene.add(loaded.root);
        district = opened;
        person = loaded;
        setName(who.name);
      } catch {
        if (!closed) setMissing(true);
      }
    })();

    /** What the stick or the keys ask for, as the simulation wants it: each axis -127 to 127, in the world's directions. */
    const wanted = (seconds: number): { dx: number; dz: number; run: boolean } => {
      let sx = input.x;
      let sy = input.y;
      let run = input.run || keys.has("shift");
      if (keys.has("w") || keys.has("arrowup")) sy -= 1;
      if (keys.has("s") || keys.has("arrowdown")) sy += 1;
      if (keys.has("a") || keys.has("arrowleft")) sx -= 1;
      if (keys.has("d") || keys.has("arrowright")) sx += 1;
      if (auto) {
        // A fixed turn round the corner: walk, run, stand, walk back.
        const beat = seconds % 16;
        const east = beat < 9 ? 1 : beat < 11.5 ? 0 : -1;
        run = beat > 5 && beat < 9;
        return { dx: 127 * east, dz: 0, run };
      }
      const length = Math.hypot(sx, sy);
      if (length < 0.12) return { dx: 0, dz: 0, run };
      const scale = Math.min(1, length) / length;
      // Up on the stick is away from the camera.
      const forwardX = -Math.sin(camera.yaw);
      const forwardZ = -Math.cos(camera.yaw);
      const worldX = (forwardX * -sy + -forwardZ * sx) * scale;
      const worldZ = (forwardZ * -sy + forwardX * sx) * scale;
      return { dx: Math.round(worldX * 127), dz: Math.round(worldZ * 127), run: run || length > 1.35 };
    };

    const open = (ground: Ground, x: number, z: number): boolean => (ground.flagsAt(Math.floor((x * 1000) / ground.cellMm), Math.floor((z * 1000) / ground.cellMm)) & OPEN) !== 0;

    let frame = 0;
    let last = 0;
    let began = 0;
    const tick = (now: number): void => {
      if (began === 0) began = now;
      const elapsed = last === 0 ? 33 : Math.min(100, now - last);
      last = now;
      const seconds = (now - began) / 1000;
      const ground = district?.chunks.ground() ?? null;
      if (district && person && ground) {
        // The simulation steps twenty times a second, whatever the frame rate; the picture glides between steps.
        carried += elapsed;
        const ask = wanted(seconds);
        while (carried >= SIM_STEP_MS) {
          carried -= SIM_STEP_MS;
          Object.assign(before, state);
          stepCharacter(state, ask, ground, [], DEFAULT_CHARACTER);
        }
        const blend = carried / SIM_STEP_MS;
        const x = (before.x + (state.x - before.x) * blend) / 1000;
        const y = (before.y + (state.y - before.y) * blend) / 1000;
        const z = (before.z + (state.z - before.z) * blend) / 1000;
        // How fast the body is really going, which is not always what was asked: a wall stops the legs too.
        const travelled = Math.hypot(state.x - before.x, state.z - before.z) / 1000 / (SIM_STEP_MS / 1000);
        speed += (travelled - speed) * Math.min(1, elapsed / 110);
        const strideM = (speed > 2.2 ? 2.5 : 1.42) * (person.height / 1.7) * (person.skirt ? 0.8 : 1);
        phase += ((speed * elapsed) / 1000 / strideM) * Math.PI * 2;
        if (ask.dx !== 0 || ask.dz !== 0) {
          const target = Math.atan2(ask.dx, ask.dz);
          const difference = Math.atan2(Math.sin(target - facing), Math.cos(target - facing));
          facing += difference * Math.min(1, elapsed / 90);
        }
        person.root.position.set(x, y, z);
        person.root.rotation.y = facing;
        person.pose({ speed, phase, time: seconds });

        // The camera: behind and above the head, pulled in before it would pass into a building.
        const upright = renderer.camera.aspect < 1;
        const reach = camera.distance * (upright ? 1.25 : 1);
        const eyeY = y + person.height * 0.86;
        let allowed = reach;
        for (let i = 1; i <= 10; i++) {
          const along = (reach * i) / 10;
          if (!open(ground, x + Math.sin(camera.yaw) * along, z + Math.cos(camera.yaw) * along)) {
            allowed = Math.max(0.9, along - 0.5);
            break;
          }
        }
        const flat = Math.cos(camera.pitch) * allowed;
        renderer.camera.position.set(x + Math.sin(camera.yaw) * flat, eyeY + Math.sin(camera.pitch) * allowed + 0.25, z + Math.cos(camera.yaw) * flat);
        renderer.camera.lookAt(x, eyeY + (upright ? 0.55 : 0.2), z);
        renderer.setFocus(x, 0, z);
        district.stand([x, z]);
        renderer.camera.position.set(x + Math.sin(camera.yaw) * flat, eyeY + Math.sin(camera.pitch) * allowed + 0.25, z + Math.cos(camera.yaw) * flat);
        renderer.camera.lookAt(x, eyeY + (upright ? 0.55 : 0.2), z);
        district.update();
        window.__andar = { x, z, speed, ready: true };
      }
      renderer.render(elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // The left of the screen is the stick, wherever the thumb lands; the rest turns the camera.
    const touches = new Map<number, { kind: "stick" | "look"; x: number; y: number }>();
    const show = (x: number, y: number, dx: number, dy: number, on: boolean): void => {
      if (!stick.current) return;
      stick.current.style.opacity = on ? "1" : "0";
      stick.current.style.transform = `translate(${x - 56}px, ${y - 56}px)`;
      stick.current.style.setProperty("--knob-x", `${dx * 34}px`);
      stick.current.style.setProperty("--knob-y", `${dy * 34}px`);
    };
    const down = (event: PointerEvent): void => {
      const rect = element.getBoundingClientRect();
      const kind = event.pointerType !== "mouse" && event.clientX - rect.left < rect.width * 0.45 ? "stick" : "look";
      touches.set(event.pointerId, { kind, x: event.clientX, y: event.clientY });
      element.setPointerCapture(event.pointerId);
      if (kind === "stick") show(event.clientX - rect.left, event.clientY - rect.top, 0, 0, true);
    };
    const move = (event: PointerEvent): void => {
      const touch = touches.get(event.pointerId);
      if (!touch) return;
      if (touch.kind === "stick") {
        const rect = element.getBoundingClientRect();
        input.x = (event.clientX - touch.x) / 48;
        input.y = (event.clientY - touch.y) / 48;
        const length = Math.max(1, Math.hypot(input.x, input.y));
        show(touch.x - rect.left, touch.y - rect.top, input.x / length, input.y / length, true);
      } else {
        camera.yaw -= (event.clientX - touch.x) * 0.006;
        camera.pitch = Math.min(0.9, Math.max(-0.05, camera.pitch + (event.clientY - touch.y) * 0.004));
        touch.x = event.clientX;
        touch.y = event.clientY;
      }
    };
    const up = (event: PointerEvent): void => {
      const touch = touches.get(event.pointerId);
      touches.delete(event.pointerId);
      if (touch?.kind === "stick") {
        input.x = input.y = 0;
        show(0, 0, 0, 0, false);
      }
    };
    const keyDown = (event: KeyboardEvent): void => void keys.add(event.key.toLowerCase());
    const keyUp = (event: KeyboardEvent): void => void keys.delete(event.key.toLowerCase());
    const onResize = (): void => renderer.resize();
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("resize", onResize);
    return () => {
      closed = true;
      cancelAnimationFrame(frame);
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("resize", onResize);
      person?.dispose();
      district?.close();
      renderer.dispose();
    };
  }, []);

  return (
    <main class="cena">
      <div class="andar-stage">
        <canvas ref={canvas} class="cena-canvas andar-canvas" />
        <div ref={stick} class="andar-stick" aria-hidden="true" />
      </div>
      <section class="cena-panel">
        <p class="cena-counts">
          {missing ? "The district and the people have not been built on this machine: run `pnpm pack:dev` (it needs Blender)." : name ? `${name} · left thumb or W A S D to walk, Shift or a long push to run, drag to look round.` : "Arriving…"}
        </p>
      </section>
    </main>
  );
}
