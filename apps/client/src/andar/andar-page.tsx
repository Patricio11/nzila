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
//   /andar?chegar          keeps the arriving screen up (for stills)
//   /andar?hour=17.3&tier=normal

import { ptAO, ptAOTranslator as tr } from "@nzila/i18n";
import { CELL_DRIVE, CELL_LOW, CELL_WALK, bodyFits, groundHeight, CELL_WATER, DEFAULT_CHARACTER, DEFAULT_CLOCK, SIM_STEP_MS, compileClock, gameTimeAt, jumpLiftMm, stepCharacter, type CharacterState, type Ground } from "@nzila/sim";
import { Arrival, Button, ChatBar, ClockChip, Compass, ContextAction, EmoteWheel, HudButton, Joystick, RouteBand, SpeechBalloon, WalletChip, type CompassMark } from "@nzila/ui";
import { PointLight, Vector3 } from "three";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { DEV_PACK } from "../render/bench-scene.ts";
import { DistrictScene } from "../render/district-scene.ts";
import { EMOTES, EMOTE_SECONDS, loadPerson, type Emote, type Person } from "../render/person.ts";
import { type VanSeen } from "../render/traffic.ts";
import { account } from "../world/account.ts";
import { type TierName } from "../render/tiers.ts";
import { dress, savedLook } from "../render/wardrobe.ts";
import { Sound } from "../sound/sound.ts";
import { Telemovel, type Marked } from "../telemovel/telemovel.tsx";
import { Arriving } from "../frontdoor/arriving.tsx";
import { LocalWorld } from "../world/provider.ts";
import { STILL, Session } from "../net/session.ts";
import { toMoveInput, type InputFrame } from "@nzila/protocol";
import { WorldRenderer } from "../render/world-renderer.ts";
import "../shell.css";
import "./andar.css";

interface Standing {
  people: { name: string; height: number; model: string; skirt: boolean; female?: boolean }[];
}

declare global {
  interface Window {
    /** For the films and the tests: where the person is and what they are doing. */
    __andar?: { x: number; z: number; speed: number; ready: boolean; seated: boolean; emote: string | null; action: string | null; lift: number; jumps: number; riding: string | null; sounds: number; names: number; waited: number; nearestVehicle: number; tangled: number; heeding: number; linked: boolean; players: number; corrections: number; channel: number | null; others: { x: number; z: number; name: string; still: boolean }[] };
  }
}

const PEOPLE = "/packs/dev-people/";
/** Cells a camera may sit over: anything a person or a vehicle can be on, what is low, and open water. */
const OPEN = CELL_WALK | CELL_DRIVE | CELL_WATER | CELL_LOW;
/** How near a standing van must be to be boarded, from its middle, in metres. */
const BOARD_REACH_M = 4.6;
/** How near a seat must be for the action to offer it, in metres. */
const SEAT_REACH_M = 1.9;
/** How many names there are for the women of the street and for the men (packages/i18n, `npc.name`). */
const NPC_NAMES = 12;
/** How far to each side the camera looks to tell a wall from a post, and how much it rises for every metre a wall pulls it in. */
const CAMERA_BESIDE_M = 0.9;
const CAMERA_LIFT = 0.42;
/** And the most it rises: enough to clear the head, never so much that it looks straight down. */
const CAMERA_LIFT_MOST_M = 1.15;
const EMOTE_LIST = EMOTES.map((id) => ({ id, label: tr.t(`emote.${id}`) }));
const worldClock = compileClock(DEFAULT_CLOCK);

/** The browser's own offer to install, which only some browsers make. */
interface InstallOffer extends Event {
  prompt?(): Promise<unknown>;
}

type Action = "sit" | "stand" | "board" | "getOff" | "askStop" | "stopAsked";

interface Hud {
  ready: boolean;
  place: string;
  second: number;
  heading: number;
  marks: CompassMark[];
  action: Action | null;
  /** The van being ridden: its line, its paragens, the one ahead. */
  ride: { line: string; stops: string[]; stopsAt: string[]; next: number; progress: number; waiting: boolean; said: string | null } | null;
  stick: { x: number; y: number; dx: number; dy: number; active: boolean };
}

export function Andar() {
  const params = new URLSearchParams(location.search);
  const canvas = useRef<HTMLCanvasElement>(null);
  // The world as this device knows it (S-1). What the address asks for wins over what was chosen before.
  const world = useMemo(() => new LocalWorld({ ...(params.get("tier") ? { tier: params.get("tier") as TierName } : {}), ...(params.get("mao") ? { leftHanded: params.get("mao") === "esquerda" } : {}) }), []);
  const [settings, setSettings] = useState(world.settings);
  useEffect(() => world.watch(() => setSettings(world.settings)), []);
  const leftHanded = settings.leftHanded;
  // `&telemovel` opens it at once, `&telemovel=mapa` on that app: for stills.
  const [phone, setPhone] = useState(params.has("telemovel"));
  const [marked, setMarked] = useState<Marked | null>(null);
  // The browser's offer to install, kept until the first ride is over: never at the first second (Task 1.8).
  const offer = useRef<InstallOffer | null>(null);
  const [install, setInstall] = useState(false);
  useEffect(() => {
    const keep = (event: Event): void => {
      event.preventDefault();
      offer.current = event;
    };
    window.addEventListener("beforeinstallprompt", keep);
    return () => window.removeEventListener("beforeinstallprompt", keep);
  }, []);
  const rode = useRef<() => void>(() => undefined);
  rode.current = () => {
    if (offer.current && !sessionStorage.getItem("nzila.install")) setInstall(true);
  };
  const markedNow = useRef<Marked | null>(null);
  markedNow.current = marked;
  const [hud, setHud] = useState<Hud>({ ready: false, place: "", second: 0, heading: 0, marks: [], action: null, ride: null, stick: { x: 0, y: 0, dx: 0, dy: 0, active: false } });
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
    const tierNow = (): TierName => (world.settings.poupanca ? "poupanca" : world.settings.tier);
    let tier = tierNow();
    const renderer = new WorldRenderer(element, tier);
    // A change of quality in Definições is a change of the picture at once.
    // Sound: on unless Definições or Modo Poupança says otherwise; it wakes at the first touch or key.
    const sound = new Sound();
    const audible = (): boolean => world.settings.sound && !world.settings.poupanca;
    sound.set(audible());
    let leftStops = new Set<string>();
    const unwatch = world.watch(() => {
      sound.set(audible());
      if (tierNow() !== tier) renderer.setTier((tier = tierNow()));
    });
    const auto = params.has("auto");
    let closed = false;
    let district: DistrictScene | null = null;
    let person: Person | null = null;
    // The zone, when there is one: it says where the player is and who else is in the street (Task 3.3).
    let session: Session | null = null;
    // How far the picture is from the body after the zone put it right: it slides there and does not jump.
    const nudge = { x: 0, y: 0, z: 0 };
    let pressed = 0;
    const state: CharacterState = { x: 0, y: 0, z: 0, yaw: 0 };
    const before = { x: 0, y: 0, z: 0 };
    const stick = { x: 0, y: 0, originX: 0, originY: 0, active: false };
    const keys = new Set<string>();
    const camera = { yaw: ((Number(params.get("cam")) || 0) * Math.PI) / 180, pitch: 0.2, distance: 4.4, held: 4.4 };
    let facing = 0;
    let phase = 0;
    let speed = 0;
    let carried = 0;
    let emote: { kind: Emote; began: number } | null = null;
    let seat: { x: number; y: number; z: number; facing: number } | null = null;
    let sit = 0;
    // Riding a van: which one, and whether the cobrador has been asked for the next paragem.
    let ride: { route: string; index: number; last: VanSeen; asked: boolean; left: boolean; camYaw: number; boardedAt: number; askedAt: number; arrivedAt: number; riders: { who: string; person: Person }[] } | null = null;
    const eye = new Vector3();
    // The lamp in a van's ceiling: lit for the one being ridden, after dark, so that everyone inside is seen.
    const cabin = new PointLight(undefined, 0, 6, 1);
    let boardsItself = params.has("apanhar");
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
        // The look chosen in the provador, when there is one and the address does not ask for somebody else.
        const look = params.has("quem") ? null : savedLook();
        const loaded = (look ? await dress(renderer, look).catch(() => null) : null) ?? (await loadPerson(renderer, PEOPLE + who.model, who.height, who.skirt, who.female === true));
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
        world.enter(opened, params.get("pack") ? `/packs/${params.get("pack")}/` : DEV_PACK);
        if (params.has("desde")) opened.runFrom(Number(params.get("desde")) * 1000);
        else if (params.has("transito")) opened.trafficAt = Number(params.get("transito")) * 1000;
        // What each person of the street is called: a name of their own, the same every day, and what they do when it is worth saying.
        opened.nameOf = (one) => ({
          name: tr.t(`npc.name.${one.female ? "f" : "m"}.${one.id % NPC_NAMES}` as "npc.name.f.0"),
          ...(`npc.role.${one.role}` in ptAO ? { role: tr.t(`npc.role.${one.role}` as "npc.role.zungueira") } : {}),
        });
        person = loaded;
        // A player with a session comes into a channel of this district. A place asked for in the address, or
        // `&sozinho`, keeps the street the phone's own: for stills, films and the bench.
        const token = account()?.token;
        if (token && !asked && !params.has("sozinho")) {
          // `&canal=3` is a friend's invitation: the matchmaker is asked for that channel and no other.
          const canal = Number(params.get("canal"));
          session = new Session(renderer, opened.manifest.id, Number.isInteger(canal) && canal > 0 ? canal : undefined);
          session.join();
        }
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

    /**
     * Whether what stands at a point is a wall, for the camera: something that goes on. A building is deep (the
     * ground stays closed behind its face); a garden wall is long (closed three paces on to one side). A post, a
     * trunk, a table with its stools are neither, and the camera looks past them.
     */
    const walled = (ground: Ground, px: number, pz: number, backX: number, backZ: number): boolean => {
      const deep = [1, 2, 3].every((n) => !open(ground, px + backX * CAMERA_BESIDE_M * n, pz + backZ * CAMERA_BESIDE_M * n));
      const long = [1, -1].some((side) => [1, 2, 3].every((n) => !open(ground, px + backZ * CAMERA_BESIDE_M * n * side, pz - backX * CAMERA_BESIDE_M * n * side)));
      return deep || long;
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
      const shown = fixedHour ? second : params.has("clock") ? second : 16.8 * 3600;
      renderer.setTime(shown);
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
        // A van standing near enough to board, and the one being ridden.
        const vans = district.traffic?.seen ?? [];
        // A van hoots as it pulls away from a paragem, louder the nearer it is.
        const standing = new Set(vans.filter((van) => van.dwelling).map((van) => `${van.route}/${van.index}`));
        for (const van of vans) {
          const far = Math.hypot(van.x - state.x / 1000, van.z - state.z / 1000);
          if (!van.dwelling && leftStops.has(`${van.route}/${van.index}`) && far < 60) sound.hoot(1 - far / 60);
        }
        leftStops = standing;
        const waiting = ride ? null : (vans.filter((van) => van.dwelling && Math.hypot(van.x - state.x / 1000, van.z - state.z / 1000) < BOARD_REACH_M)[0] ?? null);
        if (ride) {
          const riding = ride;
          const now = vans.find((van) => van.route === riding.route && van.index === riding.index);
          // Off at the paragem that was asked for, or put down where the van was when it left the road for the day.
          if (now && !now.dwelling) riding.left = true;
          // Asking counts once the van has left the paragem it was boarded at.
          if (!now || (now.dwelling && ((riding.asked && riding.left) || asks.current.act))) {
            const from = now ?? riding.last;
            const r = DEFAULT_CHARACTER.radiusMm;
            // The kerb is on the van's right; failing that its left, then wherever it stands.
            const spots = [-1.75, -2.4, 1.75, 2.4].map((side) => [from.x + Math.cos(from.yaw) * side, from.z - Math.sin(from.yaw) * side] as const);
            const spot = spots.find(([sx, sz]) => {
              const h = groundHeight(ground, Math.round(sx * 1000), Math.round(sz * 1000), CELL_WALK, DEFAULT_CHARACTER.stepUpMm);
              return bodyFits(ground, Math.round(sx * 1000), Math.round(sz * 1000), r, CELL_WALK, h, DEFAULT_CHARACTER.stepUpMm, DEFAULT_CHARACTER.maxDropMm);
            }) ?? [from.x, from.z];
            Object.assign(state, { x: Math.round(spot[0] * 1000), z: Math.round(spot[1] * 1000) });
            state.y = groundHeight(ground, state.x, state.z, CELL_WALK, DEFAULT_CHARACTER.stepUpMm);
            Object.assign(before, state);
            facing = from.yaw - Math.PI / 2;
            for (const rider of riding.riders) {
              rider.person.root.removeFromParent();
              rider.person.release();
            }
            // Out on the pavement the camera is behind the shoulder again, looking where the van was going.
            camera.yaw = from.yaw + Math.PI;
            cabin.removeFromParent();
            if (riding.left) rode.current();
            ride = null;
            // Back into the street the others are in, beside the nearest paragem to where the van put them down.
            const stop = [...district.manifest.paragens].sort((a, b) => Math.hypot(a.pos[0] - spot[0], a.pos[2] - spot[1]) - Math.hypot(b.pos[0] - spot[0], b.pos[2] - spot[1]))[0];
            session?.join(stop?.id);
          } else {
            if (asks.current.act && !riding.asked) {
              riding.asked = true;
              riding.askedAt = seconds;
            }
            if (now.dwelling && !riding.last.dwelling) riding.arrivedAt = seconds;
            riding.last = now;
            Object.assign(state, { x: Math.round(now.x * 1000), z: Math.round(now.z * 1000) });
            Object.assign(before, state);
          }
          asks.current.act = false;
          asks.current.jump = false;
        } else if (waiting && (asks.current.act || boardsItself) && !seat) {
          asks.current.act = false;
          // For a film: gets on by itself and asks for the next paragem.
          const boarded = { route: waiting.route, index: waiting.index, last: waiting, asked: boardsItself, left: false, camYaw: camera.yaw, boardedAt: seconds, askedAt: boardsItself ? seconds + 3 : -99, arrivedAt: -99, riders: [] as { who: string; person: Person }[] };
          ride = boarded;
          // The vans are each phone's own for now: whoever rides one is out of the street the others see until they get off.
          session?.leave();
          // The others in the van: the driver, the cobrador by the door, a few passengers. They get in as their bodies arrive.
          const van = district.traffic?.bodyOf(waiting.route, waiting.index);
          const people = district.people;
          if (van) {
            cabin.position.set(0, 1.7, -0.3);
            van.add(cabin);
          }
          if (van && people) {
            for (const [n, seat] of (district.traffic?.seats ?? []).entries()) {
              if (seat.who === "jogador") continue;
              const who = people.pick(seat.who === "cobrador" ? "cobrador" : "any", n * 3 + waiting.index + 2);
              if (!who) continue;
              void people.make(who).then((rider) => {
                if (!rider) return;
                if (ride !== boarded) return rider.release();
                rider.root.position.set(seat.pos[0], seat.pos[1] - 0.46 * (rider.height / 1.7), seat.pos[2]);
                rider.shadow = false;
                van.add(rider.root);
                boarded.riders.push({ who: seat.who, person: rider });
              });
            }
          }
          boardsItself = false;
          emote = null;
        }
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

        // The zone's word on where the player is: on coming in, and whenever it disagrees with the phone.
        if (session && !ride) {
          const bodies = session.bodies();
          const zoneSolids = [...district.shared(), ...bodies];
          const came = session.arrival();
          const slide = came ? { x: state.x - came.x, y: state.y - came.y, z: state.z - came.z } : session.settle(state, (body, frame) => stepCharacter(body, toMoveInput(frame), ground, zoneSolids, DEFAULT_CHARACTER));
          if (came) {
            delete state.air;
            Object.assign(state, came);
            seat = null;
          }
          if (slide && Math.hypot(slide.x, slide.z) < 6000) {
            // The body is where the zone says; the picture starts where it was and slides there.
            Object.assign(before, { x: before.x - slide.x, y: before.y - slide.y, z: before.z - slide.z });
            nudge.x += slide.x / 1000;
            nudge.y += slide.y / 1000;
            nudge.z += slide.z / 1000;
          } else if (slide) {
            Object.assign(before, state);
            Object.assign(nudge, { x: 0, y: 0, z: 0 });
          }
        }
        const fade = Math.exp(-elapsed / 90);
        nudge.x *= fade;
        nudge.y *= fade;
        nudge.z *= fade;

        // The simulation steps twenty times a second, whatever the frame rate; the picture glides between steps.
        carried += elapsed;
        while (carried >= SIM_STEP_MS) {
          carried -= SIM_STEP_MS;
          Object.assign(before, state);
          air.before = air.after >= 1 ? 0 : air.after;
          air.liftBefore = air.liftAfter;
          if (!seat && !ride) {
            const leaving = asks.current.jump && !state.air;
            let jumped = leaving;
            if (session?.walking) {
              // With the zone: the step is taken twice, once against what the zone knows of (walls, benches, the other
              // players) and once against everything the phone sees (its vans and its people of the street too). When
              // the two agree, that is the step, and the zone is sent the stick. When something only the phone sees is
              // in the way, the player stands, and the zone is told a stick at rest: so that the two always agree, and
              // nobody is pulled through a van by a zone that cannot see it (F-152).
              const frame: InputFrame = { dx: ask.dx, dz: ask.dz, run: ask.run, brake: false, ...(leaving ? { jump: true } : {}) };
              const bodies = session.bodies();
              const zone = { ...state };
              stepCharacter(zone, toMoveInput(frame), ground, [...district.shared(), ...bodies], DEFAULT_CHARACTER);
              const full = { ...state };
              stepCharacter(full, toMoveInput(frame), ground, [...district.obstacles(), ...bodies], DEFAULT_CHARACTER);
              // In the air the jump is already decided; and someone pressed against a body for a second walks on,
              // so that a person of the street who stopped on top of them is not a prison.
              const agreed = (full.x === zone.x && full.z === zone.z) || (state.air ?? 0) > 0 || pressed > 20;
              pressed = agreed ? 0 : pressed + 1;
              if (agreed) {
                delete state.air;
                delete state.airX;
                delete state.airZ;
                Object.assign(state, zone);
                session.walked(frame);
              } else {
                jumped = false;
                session.walked(STILL);
              }
            } else {
              stepCharacter(state, leaving ? { ...ask, jump: true } : ask, ground, district.obstacles(), DEFAULT_CHARACTER);
            }
            if (jumped) {
              air.count += 1;
              sound.jump();
            }
          } else {
            session?.walked(STILL);
          }
          asks.current.jump = false;
          air.after = state.air ? (DEFAULT_CHARACTER.jumpSteps - state.air) / DEFAULT_CHARACTER.jumpSteps : air.before > 0 ? 1 : 0;
          air.liftAfter = jumpLiftMm(state) / 1000;
          if (air.after === 1) {
            air.land = 1;
            sound.land();
          }
        }
        air.land = Math.max(0, air.land - elapsed / 260);
        const blend = carried / SIM_STEP_MS;
        let x = (before.x + (state.x - before.x) * blend) / 1000 + nudge.x;
        let y = (before.y + (state.y - before.y) * blend) / 1000 + nudge.y;
        const jump = jumpHeld || air.before + (air.after - air.before) * blend;
        const lift = jumpHeld ? (4 * DEFAULT_CHARACTER.jumpHeightMm * jumpHeld * (1 - jumpHeld)) / 1000 : air.liftBefore + (air.liftAfter - air.liftBefore) * blend;
        const flying = jump > 0 && jump < 1;
        let z = (before.z + (state.z - before.z) * blend) / 1000 + nudge.z;
        // How fast the body is really going, which is not always what was asked: a wall stops the legs too.
        const travelled = Math.hypot(state.x - before.x, state.z - before.z) / 1000 / (SIM_STEP_MS / 1000);
        speed += (travelled - speed) * Math.min(1, elapsed / 110);
        const strideM = (speed > 2.2 ? 2.5 : 1.42) * (person.height / 1.7) * (person.skirt ? 0.8 : 1);
        // The legs do not stride in the air.
        if (!flying) {
          const stepsBefore = Math.floor(phase / Math.PI);
          phase += ((speed * elapsed) / 1000 / strideM) * Math.PI * 2;
          // A foot comes down twice in every turn of the stride.
          if (Math.floor(phase / Math.PI) !== stepsBefore && speed > 0.4 && !ride && !seat) sound.step(speed > 2.2);
        }
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
        // Inside the van nobody is drawn yet: the body is put away for the ride.
        person.root.visible = !ride;
        person.root.rotation.y = facing;
        if (ride) {
          // Dark outside from about six in the evening to six in the morning: the lamp comes on as the day goes.
          const hour = shown / 3600;
          const dark = Math.min(1, Math.max(0, hour < 12 ? (6.4 - hour) / 0.8 : (hour - 17.4) / 0.9));
          cabin.intensity = dark * 9;
          // Everyone seated; the cobrador calls for passengers while the van stands.
          for (const [n, rider] of ride.riders.entries()) {
            rider.person.pose({ speed: 0, phase: 0, time: seconds + n * 1.7 }, { sit: 1, ...(rider.who === "cobrador" && ride.last.dwelling ? { emote: { kind: "chamar" as const, seconds: seconds % EMOTE_SECONDS.chamar } } : {}) });
          }
        }
        person.pose({ speed, phase, time: seconds }, { sit, jump, land: flying ? 0 : air.land, ...(emote ? { emote: { kind: emote.kind, seconds: frozen && held.emote ? skip : seconds - emote.began } } : {}) });

        // The camera: behind and above the head, pulled in before it would pass into a building.
        const upright = renderer.camera.aspect < 1;
        // On foot the camera is at the shoulder; riding, it stands off far enough to see the van and its street.
        const reach = (ride ? 8.5 : camera.distance) * (upright ? 1.25 : 1);
        const eyeY = y + (ride ? 1.9 : person.height * (0.86 - 0.22 * sit));
        let allowed = reach;
        // Everything built is solid now (D-0.53), posts and trunks too. A wall must pull the camera in; a post must
        // not, or the picture would lurch at every lamp. The difference is to the side: a wall goes on, a post does not.
        const backX = Math.sin(camera.yaw);
        const backZ = Math.cos(camera.yaw);
        for (let i = 1; i <= 14; i++) {
          const along = (reach * i) / 14;
          const px = x + backX * along;
          const pz = z + backZ * along;
          if (!open(ground, px, pz) && walled(ground, px, pz, backX, backZ)) {
            allowed = Math.max(0.9, along - 0.5);
            break;
          }
        }
        // In at once before a wall, a post or a trunk would come between; out again gently, so that passing
        // a row of lamps does not make the picture jump.
        camera.held = allowed < camera.held ? allowed : camera.held + (allowed - camera.held) * Math.min(1, elapsed / 420);
        allowed = camera.held;
        const flat = Math.cos(camera.pitch) * allowed;
        district.afoot = !ride;
        district.stand([x, z]);
        // North is the world's -Z; a heading is degrees clockwise from it.
        world.place(x, z, ((Math.atan2(Math.sin(facing), -Math.cos(facing)) * 180) / Math.PI + 360) % 360);
        world.inChannel(session?.walking ? session.channel : null);
        const van = ride ? district.traffic?.bodyOf(ride.route, ride.index) : null;
        const place = district.traffic?.seats.find((s) => s.who === "jogador");
        if (ride && van && place) {
          // From the seat: the eyes of someone sitting there, turned by the thumb.
          van.updateMatrixWorld();
          eye.set(place.pos[0], place.pos[1] + 0.7, place.pos[2] + 0.06);
          van.localToWorld(eye);
          // At first: ahead and a little to the left, down the van and out of the far windows.
          const turn = ride.last.yaw + 0.3 + (camera.yaw - ride.camYaw);
          const tilt = (0.2 - camera.pitch) * 0.9;
          renderer.camera.position.copy(eye);
          renderer.camera.lookAt(eye.x + Math.sin(turn) * Math.cos(tilt), eye.y + Math.sin(tilt), eye.z + Math.cos(turn) * Math.cos(tilt));
        } else {
          // Pulled in by a wall, the camera rises: it looks down over the head, and is never inside it.
          const lift = Math.min(CAMERA_LIFT_MOST_M, Math.max(0, reach - allowed) * CAMERA_LIFT);
          renderer.camera.position.set(x + Math.sin(camera.yaw) * flat, eyeY + Math.sin(camera.pitch) * allowed + 0.25 + lift, z + Math.cos(camera.yaw) * flat);
          renderer.camera.lookAt(x, eyeY + (upright ? 0.55 : 0.2), z);
        }
        renderer.setFocus(x, 0, z);
        // The other players: drawn a moment in the past, named when they stand still, given way to by the vans.
        district.others = session ? session.draw(elapsed, seconds) : [];
        district.update();

        const action: Action | null = ride ? (ride.last.dwelling ? "getOff" : ride.asked ? "stopAsked" : "askStop") : seat ? "stand" : waiting ? "board" : !moving && nearest() ? "sit" : null;
        window.__andar = { x, z, speed, ready: true, seated: sit > 0.9, emote: emote?.kind ?? null, action, lift, jumps: air.count, riding: ride ? ride.route : null, sounds: sound.played, names: district.names?.shown ?? 0, waited: district.traffic?.waited ?? 0, tangled: district.traffic?.tangled ?? 0, heeding: district.traffic?.heeding ?? 0, linked: session?.walking ?? false, players: session?.count ?? 0, corrections: session?.corrections ?? 0, channel: session?.channel ?? null, others: district.others.map((one) => ({ x: one.x, z: one.z, name: one.name, still: one.still })), nearestVehicle: Math.min(Infinity, ...[...(district.traffic?.seen ?? []), ...(district.traffic?.roaming ?? [])].map((vehicle) => Math.hypot(vehicle.x - x, vehicle.z - z))) };
        if (now - lastHud > 120) {
          // How near the bay and how near traffic, for the sea and the road in the ear: the ground is asked
          // outward from where the player stands.
          const cell = (dx: number, dz: number): number => ground.flagsAt(Math.floor(((x + dx) * 1000) / ground.cellMm), Math.floor(((z + dz) * 1000) / ground.cellMm));
          let water = 0;
          let traffic = ride ? 1 : 0;
          for (let d = 0; d <= 48 && water === 0; d += 4) if (cell(0, -d) & CELL_WATER) water = 1 - d / 52;
          for (let d = 0; d <= 24 && traffic === 0; d += 3) if ((cell(0, d) | cell(0, -d) | cell(d, 0) | cell(-d, 0)) & CELL_DRIVE) traffic = 1 - d / 28;
          sound.ambience(water, traffic);
          lastHud = now;
          // The compass turns with the camera: what is ahead is at the top. North is the world's -Z.
          const heading = (((Math.atan2(-Math.sin(camera.yaw), Math.cos(camera.yaw)) * 180) / Math.PI) + 360) % 360;
          const marks: CompassMark[] = district.manifest.paragens.map((p) => ({
            bearing: ((Math.atan2(p.pos[0] - x, -(p.pos[2] - z)) * 180) / Math.PI + 360) % 360,
            metres: Math.hypot(p.pos[0] - x, p.pos[2] - z),
            kind: "paragem" as const,
          }));
          // The place marked on the Mapa, in gold.
          const mark = markedNow.current;
          if (mark) marks.push({ bearing: ((Math.atan2(mark.x - x, -(mark.z - z)) * 180) / Math.PI + 360) % 360, metres: Math.hypot(mark.x - x, mark.z - z), kind: "target" });
          const rect = element.getBoundingClientRect();
          const length = Math.max(1, Math.hypot(stick.x, stick.y) / 1.5);
          const word = (key: string): string => district!.word(key);
          const band = ride ? { line: `${word(ride.last.stops[0]!)} · ${word(ride.last.stops[ride.last.stops.length - 1]!)}`, stops: ride.last.stops.map(word), stopsAt: ride.last.stops.map((key) => (word(`${key}.em`) === `${key}.em` ? word(key) : word(`${key}.em`))), next: ride.last.stop, progress: ride.last.progress, waiting: ride.last.dwelling, said: null as string | null } : null;
          if (band && ride) {
            // What the cobrador is saying: that the paragem was heard, where we are, or that there is room.
            // He calls the paragem ahead, always; "a sair" when someone has asked for it or the van is there.
            const ahead = band.stops[ride.last.dwelling && !ride.left ? (band.next + 1) % band.stops.length : band.next] ?? "";
            if (seconds - ride.boardedAt < 3) band.said = tr.t("ride.cobrador.squeeze");
            else if (seconds - ride.askedAt < 3.5 && !ride.last.dwelling) band.said = tr.t("ride.cobrador.asked", { proxima: ahead });
            else if (ride.last.dwelling && ride.left && seconds - ride.arrivedAt < 5) band.said = tr.t("ride.cobrador.arrived", { paragem: band.stops[band.next] ?? "" });
            else if (ride.last.dwelling && !ride.left) band.said = tr.t("ride.cobrador.call", { proxima: ahead });
          }
          setHud({ ready: true, place: district.word(district.manifest.nameKey), second, heading, marks, action, ride: band, stick: { x: stick.originX - rect.left, y: stick.originY - rect.top, dx: stick.x / 1.5 / length, dy: stick.y / 1.5 / length, active: stick.active } });
        }
      }
      renderer.render(elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // The lower third on the thumb's side is the stick, wherever the thumb lands; everywhere else turns the camera.
    const touches = new Map<number, { kind: "stick" | "look"; x: number; y: number }>();
    const down = (event: PointerEvent): void => {
      sound.wake();
      const rect = element.getBoundingClientRect();
      const across = (event.clientX - rect.left) / rect.width;
      const inZone = event.pointerType !== "mouse" && (across < 0.5) !== world.settings.leftHanded && event.clientY - rect.top > rect.height * 0.45;
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
      sound.wake();
      const key = event.key.toLowerCase();
      keys.add(key);
      // On a keyboard: E is the gold button, 1 to 4 the gestures.
      if (key === "e" && !event.repeat) asks.current.act = true;
      // Tab is the Telemóvel.
      if (key === "tab") {
        event.preventDefault();
        if (!event.repeat) setPhone((isOpen) => !isOpen);
      }
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
      unwatch();
      sound.close();
      cabin.dispose();
      session?.close();
      person?.dispose();
      district?.close();
      renderer.dispose();
    };
  }, []);

  return (
    <main class={`andar${leftHanded ? " andar-left" : ""}`}>
      <canvas ref={canvas} class="andar-canvas" />
      {(!hud.ready && !missing) || params.has("chegar") ? <Arriving poupanca={settings.poupanca} /> : null}
      {install ? (
        <div class="install" role="dialog" aria-label={tr.t("install.offer")}>
          <p>{tr.t("install.offer")}</p>
          <span class="install-keys">
            <Button onPress={() => (setInstall(false), sessionStorage.setItem("nzila.install", "1"), void offer.current?.prompt?.())}>{tr.t("install.yes")}</Button>
            <Button kind="quiet" onPress={() => (setInstall(false), sessionStorage.setItem("nzila.install", "1"))}>
              {tr.t("install.later")}
            </Button>
          </span>
        </div>
      ) : null}
      {missing ? <p class="andar-note">The district and the people have not been built on this machine: run `pnpm pack:dev` (it needs Blender).</p> : null}
      {hud.ready ? (
        <div class="andar-hud n-on-dark">
          <div class="andar-top">
            <WalletChip amount={account()?.origin?.makuta ?? 0} />
            <span class="andar-top-right">
              <Compass heading={hud.heading} marks={hud.marks} />
              <ClockChip secondOfDay={hud.second} />
            </span>
          </div>
          {arrived && !hud.ride ? <Arrival place={hud.place} /> : null}
          {hud.ride ? (
            <div class="andar-route">
              <RouteBand line={hud.ride.line} stops={hud.ride.stops} stopsAt={hud.ride.stopsAt} next={hud.ride.next} progress={hud.ride.progress} waiting={hud.ride.waiting} />
              {hud.ride.said ? (
                <p class="andar-said">
                  <SpeechBalloon text={hud.ride.said} />
                </p>
              ) : null}
            </div>
          ) : null}
          <Joystick {...hud.stick} />
          <div class="andar-buttons">
            <HudButton glyph="telemovel" label={tr.t("hud.phone")} on={phone} onPress={() => setPhone(!phone)} />
            <span class="andar-pair">
              <span class="andar-wheel-anchor">
                <EmoteWheel open={wheel} emotes={EMOTE_LIST} onPick={(id) => ((asks.current.emote = id), setWheel(false))} />
                <HudButton glyph="emote" label={tr.t("hud.emotes")} on={wheel} onPress={() => setWheel(!wheel)} />
              </span>
              <HudButton glyph="correr" label={tr.t("hud.run")} on={running} onPress={() => setRunning(!running)} />
              <HudButton glyph="saltar" label={tr.t("hud.jump")} onPress={() => (asks.current.jump = true)} />
            </span>
            {hud.action ? <ContextAction label={tr.t(`action.${hud.action}`)} disabled={hud.action === "stopAsked"} onPress={() => (asks.current.act = true)} /> : <span class="andar-action-space" />}
          </div>
          <Telemovel world={world} open={phone} first={params.get("telemovel") || null} marked={marked} onMark={setMarked} onClose={() => setPhone(false)} />
          {/* The Telemóvel covers the foot of the screen: the chat bar steps aside while it is open, or it would lie over the sheet's last key. */}
          {phone ? null : (
            <div class="andar-chat">
              <ChatBar disabled />
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}
