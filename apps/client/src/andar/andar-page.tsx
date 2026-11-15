// /andar: the first walk. One person in the development district, moved by
// the game's own rules (packages/sim: the same step the zone will run), with
// the HUD of UX_UI_SPEC.md §3.1 over the world: the wallet, the compass, the
// clock, the joystick, the one gold action, run, gestures, the Telemóvel
// button and the chat bar. What a player reads is in the catalog; the one
// line of help at the foot is for the team and is plain English.
//
//   /andar                 left thumb to walk (push far to run), drag to look, W A S D, Shift and Space (jump) on a keyboard
//   /andar?pack=l1         walks Marginal e Baixa instead of the rehearsal town
//   /andar?em=250,70       starts there (x,z in metres) instead of where arrivals do
//   /andar?quem=3          which of the people to be
//   /andar?mao=esquerda    left-handed: the stick on the right, the buttons on the left
//   /andar?auto            walks, runs, stops and waves by itself, for films; /andar?auto=180 walks one way without end (degrees, 0 north)
//   /andar?salto           jumps again and again; /andar?salto=0.5 holds the body that far through a jump (for stills)
//   /andar?gesto=acenar    makes that gesture over and over; /andar?sentar sits on the nearest bench (for stills)
//   /andar?cam=120         where the camera starts, in degrees round the person
//   /andar?transito=3      holds the traffic and the people at that second of their timetables (for stills)
//   /andar?desde=85        lets them run from that second (for films)
//   /andar?hour=17.3&tier=normal

import { ptAOTranslator as tr } from "@nzila/i18n";
import { CELL_DRIVE, CELL_LOW, CELL_WALK, CELL_WATER, DEFAULT_CHARACTER, DEFAULT_CLOCK, SIM_STEP_MS, compileClock, gameTimeAt, jumpLiftMm, stepCharacter, type CharacterState, type Ground } from "@nzila/sim";
import { Arrival, ChatBar, ClockChip, Compass, ContextAction, EmoteWheel, HudButton, Joystick, WalletChip, type CompassMark } from "@nzila/ui";
import { useEffect, useRef, useState } from "preact/hooks";
import { DEV_PACK } from "../render/bench-scene.ts";
import { DistrictScene } from "../render/district-scene.ts";
import { EMOTES, EMOTE_SECONDS, loadPerson, type Emote, type Person } from "../render/person.ts";
import { type TierName } from "../render/tiers.ts";
import { WorldRenderer } from "../render/world-renderer.ts";
import "./andar.css";

interface Standing {
  people: { name: string; height: number; model: string; skirt: boolean; female?: boolean }[];
}

declare global {
  interface Window {
    /** For the films and the tests: where the person is and what they are doing. */
    __andar?: { x: number; z: number; speed: number; ready: boolean; seated: boolean; emote: string | null; action: string | null; lift: number; jumps: number };
  }
}

const PEOPLE = "/packs/dev-people/";
/** Cells a camera may sit over: anything a person or a vehicle can be on, what is low, and open water. */
const OPEN = CELL_WALK | CELL_DRIVE | CELL_WATER | CELL_LOW;
/** How near a seat must be for the action to offer it, in metres. */
const SEAT_REACH_M = 1.9;
const EMOTE_LIST = EMOTES.map((id) => ({ id, label: tr.t(`emote.${id}`) }));
const worldClock = compileClock(DEFAULT_CLOCK);

interface Hud {
  ready: boolean;
  place: string;
  second: number;
  heading: number;
  marks: CompassMark[];
  action: "sit" | "stand" | null;
  stick: { x: number; y: number; dx: number; dy: number; active: boolean };
}

export function Andar() {
  const params = new URLSearchParams(location.search);
  const canvas = useRef<HTMLCanvasElement>(null);
  const leftHanded = params.get("mao") === "esquerda";
  const [hud, setHud] = useState<Hud>({ ready: false, place: "", second: 0, heading: 0, marks: [], action: null, stick: { x: 0, y: 0, dx: 0, dy: 0, active: false } });
  const [missing, setMissing] = useState(false);
  const [running, setRunning] = useState(false);
  const [wheel, setWheel] = useState(false);
  const [arrived, setArrived] = useState(false);
  // What the buttons ask of the frame loop.
  const asks = useRef({ run: false, emote: null as Emote | null, act: false, jump: false });
  asks.current.run = running;

  useEffect(() => {
    if (!canvas.current) return;
    const element = canvas.current;
    const fixedHour = Number(params.get("hour")) || 0;
    const renderer = new WorldRenderer(element, (params.get("tier") ?? "normal") as TierName);
    const auto = params.has("auto");
    let closed = false;
    let district: DistrictScene | null = null;
    let person: Person | null = null;
    const state: CharacterState = { x: 0, y: 0, z: 0, yaw: 0 };
    const before = { x: 0, y: 0, z: 0 };
    const stick = { x: 0, y: 0, originX: 0, originY: 0, active: false };
    const keys = new Set<string>();
    const camera = { yaw: ((Number(params.get("cam")) || 0) * Math.PI) / 180, pitch: 0.2, distance: 4.4 };
    let facing = 0;
    let phase = 0;
    let speed = 0;
    let carried = 0;
    let emote: { kind: Emote; began: number } | null = null;
    let seat: { x: number; y: number; z: number; facing: number } | null = null;
    let sit = 0;
    let lastHud = 0;
    // The jump, as the picture needs it: how far through, and how high, before and after the last step.
    const air = { before: 0, after: 0, liftBefore: 0, liftAfter: 0, land: 0, count: 0, last: 0 };
    // Asked for in the address, to hold a pose for a picture.
    // `&t=5.2` begins a held gesture that far in, to catch one figure of a dance in a still.
    const skip = Number(params.get("t")) || 0;
    // `&pausa` holds the gesture at exactly that moment.
    const frozen = params.has("pausa");
    const held = { sit: params.has("sentar"), emote: EMOTES.find((kind) => kind === params.get("gesto")) ?? null };
    const jumpsAlways = params.get("salto") === "";
    const jumpHeld = Number(params.get("salto")) || 0;
    const bearing = params.get("auto") ? (Number(params.get("auto")) * Math.PI) / 180 : null;

    void (async () => {
      try {
        const [opened, list] = await Promise.all([DistrictScene.open(renderer, params.get("pack") ? `/packs/${params.get("pack")}/` : DEV_PACK), fetch(`${PEOPLE}pessoas.json`).then((r) => r.json() as Promise<Standing>)]);
        const who = list.people[Number(params.get("quem")) || 0] ?? list.people[0]!;
        const loaded = await loadPerson(renderer, PEOPLE + who.model, who.height, who.skirt, who.female === true);
        if (closed) return opened.close();
        const asked = params.get("em")?.split(",").map(Number);
        const arrival = opened.manifest.spawns[0]!.pos;
        const spawn: readonly number[] = asked && asked.length >= 2 ? [asked[0]!, arrival[1], asked[1]!] : arrival;
        Object.assign(state, { x: Math.round(spawn[0]! * 1000), y: Math.round(spawn[1]! * 1000), z: Math.round(spawn[2]! * 1000) });
        Object.assign(before, state);
        opened.stand([spawn[0]!, spawn[2]!]);
        await opened.settle();
        if (closed) return opened.close();
        renderer.scene.add(loaded.root);
        district = opened;
        if (params.has("desde")) opened.runFrom(Number(params.get("desde")) * 1000);
        else if (params.has("transito")) opened.trafficAt = Number(params.get("transito")) * 1000;
        person = loaded;
        setArrived(true);
        setTimeout(() => setArrived(false), 2600);
      } catch {
        if (!closed) setMissing(true);
      }
    })();

    /** What the stick or the keys ask for, as the simulation wants it: each axis -127 to 127, in the world's directions. */
    const wanted = (seconds: number): { dx: number; dz: number; run: boolean } => {
      let sx = stick.x;
      let sy = stick.y;
      const run = asks.current.run || keys.has("shift");
      if (keys.has("w") || keys.has("arrowup")) sy -= 1;
      if (keys.has("s") || keys.has("arrowdown")) sy += 1;
      if (keys.has("a") || keys.has("arrowleft")) sx -= 1;
      if (keys.has("d") || keys.has("arrowright")) sx += 1;
      if (bearing !== null) return { dx: Math.round(Math.sin(bearing) * 127), dz: Math.round(-Math.cos(bearing) * 127), run };
      if (auto) {
        // A fixed turn: walk, run, stand and wave, walk back.
        const beat = seconds % 16;
        const east = beat < 9 ? 1 : beat < 11.5 ? 0 : -1;
        if (beat > 9.4 && beat < 9.5 && !emote) asks.current.emote = EMOTES[Math.floor(seconds / 16) % EMOTES.length]!;
        return { dx: 127 * east, dz: 0, run: beat > 5 && beat < 9 };
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
      const second = fixedHour ? fixedHour * 3600 : gameTimeAt(worldClock, Date.now()).secondOfDay;
      renderer.setTime(fixedHour ? second : params.has("clock") ? second : 16.8 * 3600);
      const ground = district?.chunks.ground() ?? null;
      if (district && person && ground) {
        const ask = wanted(seconds);
        const moving = ask.dx !== 0 || ask.dz !== 0;
        const nearest = (reach = SEAT_REACH_M): { x: number; y: number; z: number; facing: number } | null => {
          let best = null;
          let bestD = reach;
          for (const s of district!.manifest.seats) {
            const d = Math.hypot(s.pos[0] - state.x / 1000, s.pos[2] - state.z / 1000);
            if (d < bestD) {
              bestD = d;
              best = { x: s.pos[0], y: s.pos[1], z: s.pos[2], facing: (s.facing * Math.PI) / 180 };
            }
          }
          return best;
        };
        // The gold button, a gesture asked for, and getting up by walking away.
        if (asks.current.act) {
          asks.current.act = false;
          seat = seat ? null : nearest();
        }
        if (seat && moving) seat = null;
        if (jumpsAlways && seconds - air.last > 1.7) {
          air.last = seconds;
          asks.current.jump = true;
        }
        // A jump gets a seated person up and ends a gesture; it is not made from the bench.
        if (asks.current.jump && seat) {
          seat = null;
          asks.current.jump = false;
        }
        if (asks.current.jump) emote = null;
        if (held.sit && !seat && seconds > 0.2) {
          seat = nearest(Infinity);
          held.sit = false;
        }
        if (held.emote && !emote) asks.current.emote = held.emote;
        if (asks.current.emote) {
          emote = { kind: asks.current.emote, began: seconds - (held.emote ? skip : 0) };
          asks.current.emote = null;
        }
        if (emote && (seconds - emote.began > EMOTE_SECONDS[emote.kind] || (moving && asks.current.run))) emote = null;
        sit += ((seat ? 1 : 0) - sit) * Math.min(1, elapsed / 220);

        // The simulation steps twenty times a second, whatever the frame rate; the picture glides between steps.
        carried += elapsed;
        while (carried >= SIM_STEP_MS) {
          carried -= SIM_STEP_MS;
          Object.assign(before, state);
          air.before = air.after >= 1 ? 0 : air.after;
          air.liftBefore = air.liftAfter;
          if (!seat) {
            const leaving = asks.current.jump && !state.air;
            stepCharacter(state, leaving ? { ...ask, jump: true } : ask, ground, [], DEFAULT_CHARACTER);
            if (leaving) air.count += 1;
          }
          asks.current.jump = false;
          air.after = state.air ? (DEFAULT_CHARACTER.jumpSteps - state.air) / DEFAULT_CHARACTER.jumpSteps : air.before > 0 ? 1 : 0;
          air.liftAfter = jumpLiftMm(state) / 1000;
          if (air.after === 1) air.land = 1;
        }
        air.land = Math.max(0, air.land - elapsed / 260);
        const blend = carried / SIM_STEP_MS;
        let x = (before.x + (state.x - before.x) * blend) / 1000;
        let y = (before.y + (state.y - before.y) * blend) / 1000;
        const jump = jumpHeld || air.before + (air.after - air.before) * blend;
        const lift = jumpHeld ? (4 * DEFAULT_CHARACTER.jumpHeightMm * jumpHeld * (1 - jumpHeld)) / 1000 : air.liftBefore + (air.liftAfter - air.liftBefore) * blend;
        const flying = jump > 0 && jump < 1;
        let z = (before.z + (state.z - before.z) * blend) / 1000;
        // How fast the body is really going, which is not always what was asked: a wall stops the legs too.
        const travelled = Math.hypot(state.x - before.x, state.z - before.z) / 1000 / (SIM_STEP_MS / 1000);
        speed += (travelled - speed) * Math.min(1, elapsed / 110);
        const strideM = (speed > 2.2 ? 2.5 : 1.42) * (person.height / 1.7) * (person.skirt ? 0.8 : 1);
        // The legs do not stride in the air.
        if (!flying) phase += ((speed * elapsed) / 1000 / strideM) * Math.PI * 2;
        const target = seat ? seat.facing : moving ? Math.atan2(ask.dx, ask.dz) : facing;
        facing += Math.atan2(Math.sin(target - facing), Math.cos(target - facing)) * Math.min(1, elapsed / 90);
        if (sit > 0.001 && seat) {
          // Carried from where they stood to the seat as they sit down.
          const k = Math.min(1, sit * 1.4);
          x += (seat.x + Math.sin(seat.facing) * 0.08 - x) * k;
          z += (seat.z + Math.cos(seat.facing) * 0.08 - z) * k;
          y += (seat.y - 0.46 - y) * k;
        }
        person.root.position.set(x, y + lift, z);
        person.root.rotation.y = facing;
        person.pose({ speed, phase, time: seconds }, { sit, jump, land: flying ? 0 : air.land, ...(emote ? { emote: { kind: emote.kind, seconds: frozen && held.emote ? skip : seconds - emote.began } } : {}) });

        // The camera: behind and above the head, pulled in before it would pass into a building.
        const upright = renderer.camera.aspect < 1;
        const reach = camera.distance * (upright ? 1.25 : 1);
        const eyeY = y + person.height * (0.86 - 0.22 * sit);
        let allowed = reach;
        for (let i = 1; i <= 10; i++) {
          const along = (reach * i) / 10;
          if (!open(ground, x + Math.sin(camera.yaw) * along, z + Math.cos(camera.yaw) * along)) {
            allowed = Math.max(0.9, along - 0.5);
            break;
          }
        }
        const flat = Math.cos(camera.pitch) * allowed;
        district.stand([x, z]);
        renderer.camera.position.set(x + Math.sin(camera.yaw) * flat, eyeY + Math.sin(camera.pitch) * allowed + 0.25, z + Math.cos(camera.yaw) * flat);
        renderer.camera.lookAt(x, eyeY + (upright ? 0.55 : 0.2), z);
        renderer.setFocus(x, 0, z);
        district.update();

        const action = seat ? "stand" : !moving && nearest() ? "sit" : null;
        window.__andar = { x, z, speed, ready: true, seated: sit > 0.9, emote: emote?.kind ?? null, action, lift, jumps: air.count };
        if (now - lastHud > 120) {
          lastHud = now;
          // The compass turns with the camera: what is ahead is at the top. North is the world's -Z.
          const heading = (((Math.atan2(-Math.sin(camera.yaw), Math.cos(camera.yaw)) * 180) / Math.PI) + 360) % 360;
          const marks: CompassMark[] = district.manifest.paragens.map((p) => ({
            bearing: ((Math.atan2(p.pos[0] - x, -(p.pos[2] - z)) * 180) / Math.PI + 360) % 360,
            metres: Math.hypot(p.pos[0] - x, p.pos[2] - z),
            kind: "paragem" as const,
          }));
          const rect = element.getBoundingClientRect();
          const length = Math.max(1, Math.hypot(stick.x, stick.y) / 1.5);
          setHud({ ready: true, place: district.word(district.manifest.nameKey), second, heading, marks, action, stick: { x: stick.originX - rect.left, y: stick.originY - rect.top, dx: stick.x / 1.5 / length, dy: stick.y / 1.5 / length, active: stick.active } });
        }
      }
      renderer.render(elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // The lower third on the thumb's side is the stick, wherever the thumb lands; everywhere else turns the camera.
    const touches = new Map<number, { kind: "stick" | "look"; x: number; y: number }>();
    const down = (event: PointerEvent): void => {
      const rect = element.getBoundingClientRect();
      const across = (event.clientX - rect.left) / rect.width;
      const inZone = event.pointerType !== "mouse" && (across < 0.5) !== leftHanded && event.clientY - rect.top > rect.height * 0.45;
      const kind = inZone && !stick.active ? "stick" : "look";
      touches.set(event.pointerId, { kind, x: event.clientX, y: event.clientY });
      element.setPointerCapture(event.pointerId);
      if (kind === "stick") Object.assign(stick, { x: 0, y: 0, originX: event.clientX, originY: event.clientY, active: true });
    };
    const move = (event: PointerEvent): void => {
      const touch = touches.get(event.pointerId);
      if (!touch) return;
      if (touch.kind === "stick") {
        stick.x = (event.clientX - touch.x) / 44;
        stick.y = (event.clientY - touch.y) / 44;
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
      if (touch?.kind === "stick") Object.assign(stick, { x: 0, y: 0, active: false });
    };
    const keyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      keys.add(key);
      // On a keyboard: E is the gold button, 1 to 4 the gestures.
      if (key === "e" && !event.repeat) asks.current.act = true;
      if (key === " " && !event.repeat) {
        asks.current.jump = true;
        event.preventDefault();
      }
      const n = Number(key);
      if (n >= 1 && n <= EMOTES.length) asks.current.emote = EMOTES[n - 1]!;
    };
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
    <main class={`andar${leftHanded ? " andar-left" : ""}`}>
      <canvas ref={canvas} class="andar-canvas" />
      {missing ? <p class="andar-note">The district and the people have not been built on this machine: run `pnpm pack:dev` (it needs Blender).</p> : null}
      {hud.ready ? (
        <div class="andar-hud n-on-dark">
          <div class="andar-top">
            <WalletChip amount={1500} />
            <span class="andar-top-right">
              <Compass heading={hud.heading} marks={hud.marks} />
              <ClockChip secondOfDay={hud.second} />
            </span>
          </div>
          {arrived ? <Arrival place={hud.place} /> : null}
          <Joystick {...hud.stick} />
          <div class="andar-buttons">
            <HudButton glyph="telemovel" label={tr.t("hud.phone")} />
            <span class="andar-pair">
              <span class="andar-wheel-anchor">
                <EmoteWheel open={wheel} emotes={EMOTE_LIST} onPick={(id) => ((asks.current.emote = id), setWheel(false))} />
                <HudButton glyph="emote" label={tr.t("hud.emotes")} on={wheel} onPress={() => setWheel(!wheel)} />
              </span>
              <HudButton glyph="correr" label={tr.t("hud.run")} on={running} onPress={() => setRunning(!running)} />
              <HudButton glyph="saltar" label={tr.t("hud.jump")} onPress={() => (asks.current.jump = true)} />
            </span>
            {hud.action ? <ContextAction label={tr.t(hud.action === "sit" ? "action.sit" : "action.stand")} onPress={() => (asks.current.act = true)} /> : <span class="andar-action-space" />}
          </div>
          <div class="andar-chat">
            <ChatBar disabled />
          </div>
        </div>
      ) : null}
    </main>
  );
}
