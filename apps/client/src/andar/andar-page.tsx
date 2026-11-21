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
//   /andar?apagao          the light goes in the evening, whatever the day (for stills)
//   /andar?festa           the bairro's festa on the Largo this evening, whatever the week (for stills)
//   /andar?hour=17.3&tier=normal

import { ptAO, ptAOTranslator as tr } from "@nzila/i18n";
import { CELL_DRIVE, CELL_LOW, CELL_WALK, bodyFits, groundHeight, CELL_WATER, DEFAULT_CHARACTER, DEFAULT_CLOCK, SIM_STEP_MS, compileClock, gameTimeAt, jumpLiftMm, stepCharacter, type CharacterState, type Ground } from "@nzila/sim";
import { Arrival, Banner, Button, ChatBar, ClockChip, Compass, ContextAction, EmoteWheel, HudButton, Joystick, WalletChip, type CompassMark } from "@nzila/ui";
import { PointLight, Vector3 } from "three";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { DistrictScene } from "../render/district-scene.ts";
import { EMOTES, EMOTE_SECONDS, RUNS_ABOVE_M_S, junto, loadPerson, strideOf, type Emote, type Gesto, type Person } from "../render/person.ts";
import type { Hand } from "../render/presente.ts";
import { type VanSeen } from "../render/traffic.ts";
import { account, balanceNow, type KeptOut } from "../world/account.ts";
import { type TierName } from "../render/tiers.ts";
import { dress, savedLook } from "../render/wardrobe.ts";
import type { Sound } from "../sound/sound.ts";
import type { Marked } from "../telemovel/telemovel.tsx";
import { Arriving } from "../frontdoor/arriving.tsx";
import { LocalWorld } from "../world/provider.ts";
import { type NetState } from "../net/retry.ts";
import { STILL, Session, type Refused } from "../net/session.ts";
import { type SaidLine } from "../net/talking.ts";
import { ChatLog, Composer, type Met } from "../conversa/conversa.tsx";
import { Over, touched, type Speaking } from "../conversa/over.ts";
import { HIRED_VEHICLE_BASE, toMoveInput, type InputFrame } from "@nzila/protocol";
import { WorldRenderer } from "../render/world-renderer.ts";
import "../shell.css";
import "./andar.css";

interface Standing {
  people: { name: string; height: number; model: string; skirt: boolean; female?: boolean }[];
}

declare global {
  interface Window {
    /** For the films and the tests: where the person is and what they are doing. */
    __andar?: { tap?: string; mesa: number | null; rideRefusals: number; shop: string | null; othersOnScreen: { x: number; y: number }[]; shoulder: number; sair: { convite: number | null; saida: number | null; chegou: boolean; aviso: string | null } | null; hand: string | null; othersRiding: number; myRide: { vehicle: number; seat: number } | null; hired: { fase: string; fim: string | null; x: number; z: number } | null; streetNow: number; vans: { key: string; x: number; z: number }[]; trafficFollowed: boolean; at: number; known: number; x: number; z: number; speed: number; ready: boolean; seated: boolean; emote: string | null; action: string | null; lift: number; jumps: number; riding: string | null; sounds: number; names: number; waited: number; nearestVehicle: number; tangled: number; heeding: number; linked: boolean; players: number; corrections: number; channel: number | null; net: string; reconnections: number; fall: () => void; talk: boolean; balloons: number; lines: string[]; gestures: (string | null)[]; others: { x: number; z: number; name: string; still: boolean }[] };
  }
}

const PEOPLE = "/packs/dev-people/";
/** The rehearsal town, walked when the address asks for no other (the bench's own scene is the team's, and not fetched here). */
const DEV_PACK = "/packs/dev/";
/** Cells a camera may sit over: anything a person or a vehicle can be on, what is low, and open water. */
const OPEN = CELL_WALK | CELL_DRIVE | CELL_WATER | CELL_LOW;
/** How near a standing van must be to be boarded, from its middle, in metres. */
const BOARD_REACH_M = 6;
/** Someone this close in front, and this near the line from the camera through the player, is hidden by the player's back; the camera moves out this far. */
const HIDDEN_AHEAD_M = 4.5;
const HIDDEN_BESIDE_M = 0.7;
const SHOULDER_M = 1.8;
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

/** How often the Carteira is asked about while among people: a few bytes each time. */
const BALANCE_EVERY_MS = 25_000;

/** The sheet of someone tapped, fetched the first time anyone is (F-188). */
let fetchedSheet: typeof import("../conversa/sheet.tsx").PlayerSheet | null = null;
function LazySheet(props: Parameters<typeof import("../conversa/sheet.tsx").PlayerSheet>[0]) {
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!fetchedSheet) void import("../conversa/sheet.tsx").then((module) => ((fetchedSheet = module.PlayerSheet), redraw((n) => n + 1)));
  }, []);
  return fetchedSheet ? fetchedSheet(props) : null;
}

/** The Telemóvel, fetched the first time it is taken out: not everyone does, and the way in is full (F-270). */
let fetchedPhone: typeof import("../telemovel/telemovel.tsx").Telemovel | null = null;
function LazyPhone(props: Parameters<typeof import("../telemovel/telemovel.tsx").Telemovel>[0]) {
  const [, redraw] = useState(0);
  useEffect(() => {
    if (props.open && !fetchedPhone) void import("../telemovel/telemovel.tsx").then((module) => ((fetchedPhone = module.Telemovel), redraw((n) => n + 1)), () => {});
  }, [props.open]);
  // On a weak line it takes a moment: said, so that the press is never met with nothing (F-276).
  return fetchedPhone ? fetchedPhone(props) : props.open ? (
    <div class="andar-net">
      <Banner>{tr.t("state.opening")}</Banner>
    </div>
  ) : null;
}

/** The cantina's grille and the Mochila, fetched the first time either is opened (F-188). */
type Loja = typeof import("../cantina/loja.tsx");
let fetchedLoja: Loja | null = null;
function LazyLoja({ show }: { show: (module: Loja) => preact.JSX.Element }) {
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!fetchedLoja) void import("../cantina/loja.tsx").then((module) => ((fetchedLoja = module), redraw((n) => n + 1)));
  }, []);
  return fetchedLoja ? show(fetchedLoja) : null;
}

// Each biscato's screen, by its kind: fetched when its button is pressed (Task 4.5).
const pratos = () => import("../biscatos/pratos.tsx");
const BISCATOS: Record<string, typeof pratos | undefined> = { pratos, corte: () => import("../servicos/barbearia.tsx"), carga: () => import("../biscatos/carga.tsx"), zunga: () => import("../biscatos/zunga.tsx"), carros: () => import("../biscatos/carros.tsx") };
// A biscato's button is named by its kind ("pratos": "Lavar pratos").
type Action = "viajar" | "sit" | "stand" | "board" | "getOff" | "askStop" | "stopAsked" | "caixa" | "buy" | "entregar" | "procurar" | "xadrez" | "damas" | "ludo" | "pratos" | "corte" | "carga" | "zunga" | "carros";
type Errands = import("../recados/rua.ts").StreetErrands;
/** The tables of the bairro (Task 4B.1), fetched when the district has any. */
type Tables = import("../mesas/mesas.ts").Mesas;

interface Hud {
  /** Whether talk is open where the player is; the last lines said near them; why their last line was not said. */
  talk: boolean;
  lines: readonly SaidLine[];
  refused: Refused | null;
  out: KeptOut | null;
  /** What is in the Carteira, as the books last said. */
  cash: number;
  /** Someone has just waved at the player, or the two have just met. */
  said: { kind: "met" | "waved" | "greeted" | "got" | "dito" | "recado" | "recadoNo"; name: string; amount: number } | null;
  /** How it stands with the zone: the player is told when a line is being picked up, and when it could not be. */
  net: NetState;
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
  // Which app the Telemóvel opens on: the one the address asked for, or the Banco when the player uses a caixa.
  const [phoneApp, setPhoneApp] = useState<string | null>(params.get("telemovel") || null);
  const [marked, setMarked] = useState<Marked | null>(null);
  // Fome and Energia (Task 4.4): their bars, fetched by the frame loop the first time a need is under half.
  const [Needs, setNeeds] = useState<typeof import("../necessidades/barras.tsx").Necessidades | null>(null);
  // The ride's chip and band, fetched when a van stands near or the player rides (carrinha.tsx).
  const [Viagem, setViagem] = useState<typeof import("./carrinha.tsx").Viagem | null>(null);
  // A biscato being worked (Task 4.5): its kind and its place's name, and its screen once fetched. The body stands still.
  const [biscato, setBiscato] = useState<{ kind: string; name: string } | null>(null);
  const [Trabalho, setTrabalho] = useState<typeof import("../biscatos/pratos.tsx").Biscato | null>(null);
  const working = useRef(false);
  // Rides asked for (Task 6.2): their module, fetched the first time one is on the road or asked for; and its drawing.
  const [Corrida, setCorrida] = useState<typeof import("./corrida.tsx") | null>(null);
  const corridas = useRef<import("./corrida.tsx").Corridas | null>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);
  const districtRef = useRef<DistrictScene | null>(null);
  working.current = biscato !== null;
  // Kambas (Task 4B.2): what waits in Mensagens, and a kamba's conversation to open it on.
  const [novas, setNovas] = useState(0);
  const [abrirKamba, setAbrirKamba] = useState<string | null>(null);
  // The cantina whose grille the player is at, and the Mochila, when open.
  const [shop, setShop] = useState<{ id: string; name: string } | null>(null);
  const errandsRef = useRef<Errands | null>(null);
  // The table the zone has the player sitting at, whose board is open.
  const tablesRef = useRef<Tables | null>(null);
  const [table, setTable] = useState<number | null>(null);
  const [bag, setBag] = useState(false);
  // The browser's offer to install, kept until the first ride is over: never at the first second (Task 1.8).
  const offer = useRef<InstallOffer | null>(null);
  const [install, setInstall] = useState(false);
  const [Oferta, setOferta] = useState<typeof import("./oferta.tsx").Oferta | null>(null);
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
    if (!offer.current || sessionStorage.getItem("nzila.install")) return;
    setInstall(true);
    void import("./oferta.tsx").then((module) => setOferta(() => module.Oferta));
  };
  const markedNow = useRef<Marked | null>(null);
  markedNow.current = marked;
  const [hud, setHud] = useState<Hud>({ talk: false, lines: [], refused: null, out: null, cash: account()?.wallet?.cash ?? account()?.origin?.makuta ?? 0, said: null, net: "alone", ready: false, place: "", second: 0, heading: 0, marks: [], action: null, ride: null, stick: { x: 0, y: 0, dx: 0, dy: 0, active: false } });
  /** Going out with someone (Task 10.13): fetched when a card is opened or an ask arrives, in a district with places for it. */
  const [SairM, setSairM] = useState<typeof import("../sair/sair.tsx") | null>(null);
  const sairRef = useRef<import("../sair/sair.tsx").Sair | null>(null);
  const sairLoading = useRef(false);
  const loadSair = (): void => {
    const district = districtRef.current;
    if (sairLoading.current || !district) return;
    sairLoading.current = true;
    void import("../sair/sair.tsx").then((module) => {
      sairRef.current = new module.Sair(module.lugaresDe(district.manifest.pois, (key) => district.word(key)));
      setSairM(() => module);
    }, () => void (sairLoading.current = false));
  };
  /** The ball of a campo: fetched the first time the zone speaks of one. */
  const [CampoM, setCampoM] = useState<typeof import("../campo/bola.tsx") | null>(null);
  const campo = useRef<import("../campo/bola.tsx").Bolas | "loading" | null>(null);
  /** From one bairro to another (Task 11.2): fetched the first time the player stands at a paragem that leads elsewhere. */
  type Entre = typeof import("./entre-bairros.tsx");
  const [EntreM, setEntreM] = useState<Entre | null>(null);
  const entre = useRef<{ module: Entre; portas: import("./entre-bairros.tsx").Porta[] } | "loading" | null>(null);
  const [porta, setPorta] = useState<import("./entre-bairros.tsx").Porta | null>(null);
  /** The ride module: fetched once, and its drawing made in the street's world. */
  const loadCorrida = async (): Promise<typeof import("./corrida.tsx")> => {
    const module = await import("./corrida.tsx");
    if (!corridas.current && rendererRef.current) corridas.current = new module.Corridas(rendererRef.current, districtRef.current?.people ?? null);
    setCorrida(() => module);
    return module;
  };
  useEffect(() => void (!Viagem && (hud.ride || hud.action === "board") && import("./carrinha.tsx").then((module) => setViagem(() => module.Viagem))), [hud.ride !== null || hud.action === "board"]);
  useEffect(() => void (biscato && BISCATOS[biscato.kind]?.().then((module) => setTrabalho(() => module.Biscato))), [biscato?.kind]);
  const [missing, setMissing] = useState(false);
  /** The line being typed is open; and someone met, whose card is up. */
  const [composing, setComposing] = useState(false);
  const [met, setMet] = useState<Met | null>(null);
  useEffect(() => void (met && loadSair()), [met !== null]);
  /** The session, for what the player does with their hands: say, type, silence. Set when the world is entered. */
  const net = useRef<Session | null>(null);
  const overBox = useRef<HTMLDivElement>(null);
  /** "Tentar de novo": asks the session for another try. */
  const retryNet = useRef<() => void>(() => {});
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
    rendererRef.current = renderer;
    // A change of quality in Definições is a change of the picture at once.
    // Sound: on unless Definições or Modo Poupança says otherwise; it wakes at the first touch or key. Fetched as the
    // street opens, after the way in (F-202): a step or two in silence is all it costs.
    let sound: Sound | null = null;
    const audible = (): boolean => world.settings.sound && !world.settings.poupanca;
    void import("../sound/sound.ts").then((module) => {
      if (closed) return;
      sound = new module.Sound();
      sound.set(audible());
    });
    let leftStops = new Set<string>();
    const unwatch = world.watch(() => {
      sound?.set(audible());
      if (tierNow() !== tier) renderer.setTier((tier = tierNow()));
    });
    const auto = params.has("auto");
    let closed = false;
    let district: DistrictScene | null = null;
    let person: Person | null = null;
    // The zone, when there is one: it says where the player is and who else is in the street (Task 3.3).
    let session: Session | null = null;
    let stopWatch = (): void => {};
    // What hangs over heads: words, dots, empty balloons. And when the player's last line was refused, until when to say so.
    let over: Over | null = null;
    let said: { kind: "met" | "waved" | "greeted" | "got" | "dito" | "recado" | "recadoNo"; name: string; amount?: number; until: number } | null = null;
    // Os recados do dia in the street, fetched once the player is among others.
    let errands: Errands | null = null;
    let tables: Tables | null = null;
    let atTable: { mesa: number } | null = null;
    const thanked = (answer: { said: string; pay?: number; who: string } | null): void => {
      if (!answer) return;
      said = answer.said === "ok" ? { kind: "recado", name: answer.who, amount: answer.pay ?? 0, until: performance.now() + 5000 } : { kind: "recadoNo", name: answer.said, until: performance.now() + 3500 };
    };
    let balanceAt = performance.now();
    let refusedUntil = 0;
    let refusedWhy: Refused | null = null;
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
    let emote: { kind: Gesto; began: number; com?: number } | null = null;
    /** A thing just given or just received, in the player's own hand: fetched the first time there is one. */
    let hand: Hand | null = null;
    let seat: { x: number; y: number; z: number; facing: number; n: number } | null = null;
    // Sitting on a bench, or getting up, said to the zone too (F-205): everyone sees it, and the player rests.
    const sitOn = (next: typeof seat): void => {
      session?.bench(seat?.n ?? -1, next?.n ?? -1);
      seat = next;
    };
    let sit = 0;
    // Riding a van: which one, and whether the cobrador has been asked for the next paragem.
    let ride: { route: string; index: number; last: VanSeen; asked: boolean; left: boolean; camYaw: number; boardedAt: number; askedAt: number; arrivedAt: number; riders: { who: string; person: Person; seat: number }[] } | null = null;
    const riderSeats = new Map<number, string>();
    const eye = new Vector3();
    // The lamp in a van's ceiling: lit for the one being ridden, after dark, so that everyone inside is seen.
    const cabin = new PointLight(undefined, 0, 6, 1);
    let boardsItself = params.has("apanhar");
    /** How many times the zone said no to a seat: for the tests. */
    let rideRefusals = 0;
    let lastHud = 0;
    /** How far out over the shoulder the camera is, to see someone the player's own back would hide. */
    let shoulder = 0;
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
        districtRef.current = opened;
        world.enter(opened, params.get("pack") ? `/packs/${params.get("pack")}/` : DEV_PACK);
        // `&festa`: the bairro's festa on the Largo, for stills (in the street with others, os recados decide it).
        if (params.has("festa") && opened.crowd) opened.crowd.festa = true;
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
        retryNet.current = () => session?.retry();
        if (token && !asked && !params.has("sozinho")) {
          // `&canal=3` is a friend's invitation: the matchmaker is asked for that channel and no other.
          const canal = Number(params.get("canal"));
          session = new Session(renderer, opened.manifest.id, Number.isInteger(canal) && canal > 0 ? canal : undefined);
          session.seatOthers(
            (vehicle) => (vehicle >= HIRED_VEHICLE_BASE ? (corridas.current?.bodyAt(vehicle) ?? null) : (opened.traffic?.bodyAt(vehicle) ?? null)),
            (seat, vehicle) => (vehicle >= HIRED_VEHICLE_BASE ? (corridas.current?.seatAt(vehicle, seat) ?? null) : (opened.traffic?.seats[seat]?.pos ?? null)),
          );
          net.current = session;
          if (overBox.current) over = new Over(overBox.current);
          // `&paragem=<id>` comes in beside a paragem, as someone off a van does: for the tests of riding together.
          session.join(params.get("paragem") ?? undefined);
          // The kambas (Task 4B.2): what waits in Mensagens is watched from now, fetched after the way in.
          // What the street watches once it is open: the kambas' count, and Fome and Energia's bars (fetched after the way in).
          void import("./vigia.ts").then((module) => !closed && (stopWatch = module.vigiar(() => session?.needs ?? null, setNovas, setMarked, (bars) => setNeeds(() => bars))));
          void import("../recados/rua.ts").then((module) => {
            if (closed) return;
            errands = new module.StreetErrands(opened, renderer);
            errandsRef.current = errands;
            void errands.start();
          });
        }
        if ((opened.manifest.tables?.length ?? 0) > 0) {
          void import("../mesas/mesas.ts").then((module) => {
            if (!closed) tables = tablesRef.current = new module.Mesas(opened, renderer, session);
          });
        }
        setArrived(true);
        setTimeout(() => setArrived(false), 2600);
      } catch {
        if (!closed) setMissing(true);
      }
    })();

    /** What the stick or the keys ask for, as the simulation wants it: each axis -127 to 127, in the world's directions. */
    const wanted = (seconds: number): { dx: number; dz: number; run: boolean } => {
      if (working.current || (session?.myRide?.vehicle ?? 0) >= HIRED_VEHICLE_BASE) return { dx: 0, dz: 0, run: false };
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
        const nearest = (reach = SEAT_REACH_M): { x: number; y: number; z: number; facing: number; n: number } | null => {
          let best = null;
          let bestD = reach;
          for (const [n, s] of district!.manifest.seats.entries()) {
            const d = Math.hypot(s.pos[0] - state.x / 1000, s.pos[2] - state.z / 1000);
            if (d < bestD) {
              bestD = d;
              best = { x: s.pos[0], y: s.pos[1], z: s.pos[2], facing: (s.facing * Math.PI) / 180, n };
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
          if (!van.dwelling && leftStops.has(`${van.route}/${van.index}`) && far < 60) sound?.hoot(1 - far / 60);
        }
        leftStops = standing;
        const waiting = ride ? null : (vans.filter((van) => van.dwelling && Math.hypot(van.x - state.x / 1000, van.z - state.z / 1000) < BOARD_REACH_M)[0] ?? null);
        if (ride && session?.rideRefused) {
          session.rideRefused = false;
          rideRefusals += 1;
          for (const rider of ride.riders) {
            rider.person.root.removeFromParent();
            rider.person.release();
          }
          cabin.removeFromParent();
          ride = null;
        }
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
            // Off where the van stands, and the zone is told where: it puts the body there, or as near as there is room.
            session?.alight(state.x, state.z);
          } else {
            // A passenger of the street sitting where a player sits is not drawn: the seat is the player's.
            const vehicle = district.traffic?.indexOf(riding.route, riding.index) ?? -1;
            const taken = new Set([...(session?.seatsTaken(vehicle) ?? []), ...(session?.myRide ? [session.myRide.seat] : [])]);
            for (const rider of riding.riders) rider.person.root.visible = !taken.has(rider.seat);
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
          const boarded = { route: waiting.route, index: waiting.index, last: waiting, asked: boardsItself, left: false, camYaw: camera.yaw, boardedAt: seconds, askedAt: boardsItself ? seconds + 3 : -99, arrivedAt: -99, riders: [] as { who: string; person: Person; seat: number }[] };
          ride = boarded;
          // The zone is asked for a seat (F-157): among people, everyone near sees who rides, and two can ride together.
          const vehicle = district.traffic?.indexOf(waiting.route, waiting.index) ?? -1;
          if (session?.walking && vehicle >= 0) session.board(vehicle);
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
              riderSeats.set(n, seat.who);
              const who = people.pick(seat.who === "cobrador" ? "cobrador" : "any", n * 3 + waiting.index + 2);
              if (!who) continue;
              void people.make(who).then((rider) => {
                if (!rider) return;
                if (ride !== boarded) return rider.release();
                rider.root.position.set(seat.pos[0], seat.pos[1] - 0.46 * (rider.height / 1.7), seat.pos[2]);
                rider.shadow = false;
                van.add(rider.root);
                boarded.riders.push({ who: seat.who, person: rider, seat: n });
              });
            }
          }
          boardsItself = false;
          emote = null;
        }
        // The gold button, a gesture asked for, and getting up by walking away. At the place of one of today's errands
        // it hands the thing over, or looks for whoever was to be there: before the caixa or the shop that may stand
        // at the same place, since the errand is why the player came.
        // The tables: where the zone has the player sitting, they sit; the button sits them, or gets them up, through the zone.
        const played = tables && !ride ? tables.frame(seconds, state.x / 1000, state.z / 1000) : null;
        if (played?.mine && atTable?.mesa !== played.mine.mesa) {
          atTable = played.mine;
          seat = { ...played.mine.seat, n: -1 };
          setTable(played.mine.mesa);
          // Over the player's right shoulder and close, at the table and whoever sits across it.
          camera.yaw = seat.facing + Math.PI - 0.32;
          camera.pitch = 0.42;
          camera.distance = 3.2;
        } else if (!played?.mine && atTable) {
          atTable = null;
          seat = null;
          setTable(null);
          camera.pitch = 0.2;
          camera.distance = 4.4;
        }
        if (atTable && (asks.current.act || moving || asks.current.jump)) {
          asks.current.act = asks.current.jump = false;
          tables!.ask({ mesa: atTable.mesa, pedido: "levantar" });
        }
        const tableNear = !seat && !moving ? (played?.near ?? null) : null;
        if (asks.current.act && tableNear) {
          asks.current.act = false;
          tables!.ask({ mesa: tableNear.mesa, pedido: "sentar", lugar: tableNear.lugar });
        }
        const hired = !seat && !ride ? (corridas.current?.action(session?.myRide ?? null, state.x / 1000, state.z / 1000) ?? null) : null;
        if (asks.current.act && hired) {
          asks.current.act = false;
          corridas.current!.act(net, hired);
        }
        const errand = !seat && !ride && !moving ? (errands?.near(state.x / 1000, state.z / 1000) ?? null) : null;
        if (asks.current.act && errand) {
          asks.current.act = false;
          void errands!.act(errand.n).then(thanked);
        }
        if (asks.current.act && !seat && world.atCaixa() && !moving) {
          // At a caixa the button opens the Banco.
          asks.current.act = false;
          setPhoneApp("banco");
          setPhone(true);
        }
        // The shop the player is at; the button offers it once they stand still.
        const shopHere = !seat && !ride ? world.atShop() : null;
        const atShop = moving ? null : shopHere;
        if (asks.current.act && atShop) {
          // At a cantina's grille the button opens it.
          asks.current.act = false;
          setShop(atShop);
        }
        // At a paragem that leads to another bairro, standing still on foot, the button offers the van there.
        const here = district;
        if (!entre.current && here && here.manifest.gateways.length > 0) {
          entre.current = "loading";
          void import("./entre-bairros.tsx").then((module) => {
            entre.current = { module, portas: module.portasDe(here.manifest.gateways, (key) => here.word(key)) };
            setEntreM(() => module);
          }, () => void (entre.current = null));
        }
        const wayOut = entre.current && entre.current !== "loading" && session?.walking && !seat && !ride && !moving ? entre.current.module.portaAqui(entre.current.portas, state.x / 1000, state.z / 1000) : null;
        if (asks.current.act && wayOut && !atShop && !errand && !(!moving && world.atCaixa())) {
          asks.current.act = false;
          setPorta(wayOut);
        }
        // At a biscato's place, standing still, the button offers the work.
        const biscatoHere = !seat && !ride && !moving ? world.atBiscato() : null;
        if (asks.current.act && biscatoHere) {
          asks.current.act = false;
          setBiscato(biscatoHere);
        }
        if (asks.current.act) {
          asks.current.act = false;
          sitOn(seat ? null : nearest());
        }
        if (seat && moving && !atTable) sitOn(null);
        if (jumpsAlways && seconds - air.last > 1.7) {
          air.last = seconds;
          asks.current.jump = true;
        }
        // A jump gets a seated person up and ends a gesture; it is not made from the bench.
        if (asks.current.jump && seat) {
          sitOn(null);
          asks.current.jump = false;
        }
        if (asks.current.jump) emote = null;
        if (held.sit && !seat && seconds > 0.2) {
          sitOn(nearest(Infinity));
          held.sit = false;
        }
        if (held.emote && !emote) asks.current.emote = held.emote;
        if (asks.current.emote) {
          // The others see it too.
          session?.gesture(asks.current.emote);
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
            // Too tired (the zone says so, Task 4.4): neither going fast nor jumping is asked for.
            const tired = session?.needs?.tired === true;
            const leaving = asks.current.jump && !state.air && !tired;
            let jumped = leaving;
            if (session?.walking) {
              // With the zone: the step is taken twice, once against what the zone knows of (walls, benches, the other
              // players) and once against everything the phone sees (its vans and its people of the street too). When
              // the two agree, that is the step, and the zone is sent the stick. When something only the phone sees is
              // in the way, the player stands, and the zone is told a stick at rest: so that the two always agree, and
              // nobody is pulled through a van by a zone that cannot see it (F-152).
              const frame: InputFrame = { dx: ask.dx, dz: ask.dz, run: ask.run && !tired, brake: false, ...(leaving ? { jump: true } : {}) };
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
              // Alone, or while a fallen line is picked up: the phone's own street, with the others solid where they were last seen.
              stepCharacter(state, leaving ? { ...ask, jump: true } : ask, ground, session ? [...district.obstacles(), ...session.bodies()] : district.obstacles(), DEFAULT_CHARACTER);
            }
            if (jumped) {
              air.count += 1;
              sound?.jump();
            }
          } else {
            session?.walked(STILL);
          }
          asks.current.jump = false;
          air.after = state.air ? (DEFAULT_CHARACTER.jumpSteps - state.air) / DEFAULT_CHARACTER.jumpSteps : air.before > 0 ? 1 : 0;
          air.liftAfter = jumpLiftMm(state) / 1000;
          if (air.after === 1) {
            air.land = 1;
            sound?.land();
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
        const strideM = strideOf(speed, person.height, person.skirt);
        // The legs do not stride in the air.
        if (!flying) {
          const stepsBefore = Math.floor(phase / Math.PI);
          phase += ((speed * elapsed) / 1000 / strideM) * Math.PI * 2;
          // A foot comes down twice in every turn of the stride.
          if (Math.floor(phase / Math.PI) !== stepsBefore && speed > 0.4 && !ride && !seat) sound?.step(speed > RUNS_ABOVE_M_S);
        }
        if (session?.par) {
          emote = { ...session.par, began: seconds };
          session.par = null;
        }
        // A gesture made with someone: turned to them and drawn up to them while it lasts.
        const com = emote?.com === undefined ? undefined : session?.heads().find((one) => one.id === emote!.com);
        const near = com && emote ? junto(emote.kind, x, z, com.x, com.z, Math.min(1, (seconds - emote.began) / 0.4)) : null;
        if (near) {
          x = near.x;
          z = near.z;
        }
        const target = near ? near.facing : seat ? seat.facing : moving ? Math.atan2(ask.dx, ask.dz) : facing;
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
        if (session?.handed) {
          const { mode, item } = session.handed;
          session.handed = null;
          void import("../render/presente.ts").then((module) => (hand ??= new module.Hand())[mode](item), () => {});
        }
        const holding = hand?.update(seconds);
        person.pose({ speed, phase, time: seconds }, { sit, jump, land: flying ? 0 : air.land, ...(holding ? { holding } : {}), ...(emote ? { emote: { kind: emote.kind, seconds: frozen && held.emote ? skip : seconds - emote.began } } : {}) });
        if (session && !Corrida && (session.corridas || session.pedidos.length)) void loadCorrida();
        if (session && session.saidas.length > 0 && !sairRef.current) loadSair();
        if (session && session.bolas.length > 0 && !campo.current) {
          campo.current = "loading";
          void import("../campo/bola.tsx").then(
            (module) => ((campo.current = new module.Bolas(renderer.scene)), setCampoM(() => module)),
            () => void (campo.current = null),
          );
        }
        if (campo.current && campo.current !== "loading") campo.current.update(net, performance.now());
        sairRef.current?.hear(net, x, z);
        corridas.current?.update(session?.corridas ?? null, session?.pedidos ?? [], ground, Date.now() + (session?.zoneClockAhead ?? 0), elapsed, seconds);
        const hiredBody = corridas.current?.carry(person, session?.myRide ?? null, seconds) ? corridas.current.bodyAt(session!.myRide!.vehicle) : null;
        if (hiredBody) {
          // On a ride one asked for, the view keeps to the ride as it is drawn, and comes round behind it as it turns.
          x = hiredBody.position.x;
          y = hiredBody.position.y;
          z = hiredBody.position.z;
          camera.yaw += Math.atan2(Math.sin(hiredBody.rotation.y + Math.PI - camera.yaw), Math.cos(hiredBody.rotation.y + Math.PI - camera.yaw)) * Math.min(1, elapsed / 1800);
        }

        // The camera: behind and above the head, pulled in before it would pass into a building.
        const upright = renderer.camera.aspect < 1;
        // On foot the camera is at the shoulder; riding, it stands off far enough to see the van and its street, or the moto and its driver.
        const reach = (ride ? 8.5 : hiredBody ? 5.6 : camera.distance) * (upright ? 1.25 : 1);
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
        world.inChannel(session?.walking ? session.channel : null, session, session?.namedChannel ?? null);
        const van = ride ? district.traffic?.bodyOf(ride.route, ride.index) : null;
        // The seat the zone gave the player, or the player's own seat when walking alone.
        const mySeat = session?.myRide?.seat;
        const place = (mySeat !== undefined ? district.traffic?.seats[mySeat] : undefined) ?? district.traffic?.seats.find((s) => s.who === "jogador");
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
          // Someone standing close in front, behind the player's own back from here: the camera eases out over the
          // shoulder until they are seen, and back when they are not there (F-189).
          const aheadX = -Math.sin(camera.yaw);
          const aheadZ = -Math.cos(camera.yaw);
          const hidden = (session?.heads() ?? []).some((one) => {
            const forward = (one.x - x) * aheadX + (one.z - z) * aheadZ;
            const beside = Math.abs((one.x - x) * aheadZ - (one.z - z) * aheadX);
            // In front of the player, or between the camera and the player: either way one hides the other.
            return forward > 0.3 - flat && forward < HIDDEN_AHEAD_M && Math.abs(forward) > 0.2 && beside < HIDDEN_BESIDE_M;
          });
          shoulder += ((hidden ? SHOULDER_M : 0) - shoulder) * Math.min(1, elapsed / 350);
          const sideX = Math.cos(camera.yaw) * shoulder;
          const sideZ = -Math.sin(camera.yaw) * shoulder;
          renderer.camera.position.set(x + Math.sin(camera.yaw) * flat + sideX, eyeY + Math.sin(camera.pitch) * allowed + 0.25 + lift, z + Math.cos(camera.yaw) * flat + sideZ);
          renderer.camera.lookAt(x, eyeY + (upright ? 0.55 : 0.2), z);
        }
        renderer.setFocus(x, 0, z);
        // The other players: drawn a moment in the past, named when they stand still, given way to by the vans.
        district.others = session ? session.draw(elapsed, seconds, state.x / 1000, state.z / 1000) : [];
        // The street by the zone's clock, and its traffic waiting as the zone decided for everyone (F-152).
        if (session?.walking && session.zoneClockAhead !== null) {
          district.followZone(session.zoneClockAhead, session.traffic);
          session.traffic = null;
        }
        district.update();
        errands?.update(x, z, seconds, elapsed, shown);
        if (session && over) {
          // Over each speaker's head, the player's own included: their words, their dots, or an empty balloon.
          const clock = performance.now();
          const heads = session.heads();
          const speakers: Speaking[] = [];
          for (const id of session.talk.speaking(clock)) {
            const balloon = session.talk.over(id, clock);
            const head = id === session.me ? { x, y: y + person.height, z } : heads.find((one) => one.id === id);
            if (balloon && head) speakers.push({ id, x: head.x, y: head.y, z: head.z, balloon });
          }
          over.update(renderer.camera, ride ? [] : speakers, x, z);
          // What the Carteira holds is asked now and then while among people, and at once after the sheet of someone
          // met is shut: Makuta handed over is seen without being looked for.
          if (clock - balanceAt > BALANCE_EVERY_MS || session.given) {
            session.given = false;
            balanceAt = clock;
            void balanceNow().then((got) => {
              if (!got) return;
              if (!got.item) return void (said = { kind: "got", name: got.from ?? "", amount: got.amount, until: performance.now() + 5000 });
              // A thing given (D-10.2): its words come with the things' own, fetched now.
              void import("@nzila/i18n/later").then(({ ptAOLater }) => {
                tr.extend(ptAOLater);
                said = { kind: "dito", name: tr.t("presente.got" as "pay.got", { name: got.from ?? "", item: tr.t(`item.${got.item}.um` as "pay.got") }), until: performance.now() + 6000 };
              });
            });
          }
          if (session.met) {
            said = { kind: "met", name: session.met, until: clock + 4500 };
            // Today's errand may have been to greet someone new: said done, when it is, once the meeting has been said.
            void errands?.met().then((answer) => setTimeout(() => thanked(answer), 4600));
            session.met = null;
            sound?.meet();
          } else if (session.waved) {
            // Only a wave from close by is an invitation to wave back.
            const head = heads.find((one) => one.id === session!.waved!.entity);
            if (head && Math.hypot(head.x - x, head.z - z) < 6 && (!said || (said.kind !== "met" && said.kind !== "got"))) said = { kind: session.waved.spoke ? "greeted" : "waved", name: session.waved.name, until: clock + 6000 };
            session.waved = null;
          }
          if (session.refused) {
            refusedWhy = session.refused;
            refusedUntil = clock + 4500;
            session.refused = null;
          }
        }

        const action: Action | null = ride ? (ride.last.dwelling ? "getOff" : ride.asked ? "stopAsked" : "askStop") : hired ?? (atTable ? null : seat ? "stand" : waiting ? "board" : tableNear ? tableNear.jogo : errand ? (errand.kind === "traz" ? "entregar" : "procurar") : !moving && world.atCaixa() ? "caixa" : atShop ? "buy" : wayOut ? "viajar" : biscatoHere ? (biscatoHere.kind as Action) : !moving && nearest() ? "sit" : null);
        // Where each other player's chest is on the screen, in CSS pixels: for the tests that tap someone. Only those in
        // front of the camera: one behind it would project, mirrored, onto an empty part of the screen.
        const box = canvas.current?.getBoundingClientRect();
        const onScreen = box ? (session?.heads() ?? []).flatMap((one) => {
          const point = new Vector3(one.x, one.y - 0.6, one.z).project(renderer.camera);
          return point.z > 1 ? [] : [{ x: box.left + ((point.x + 1) / 2) * box.width, y: box.top + ((1 - point.y) / 2) * box.height }];
        }) : [];
        window.__andar = { ...(window.__andar?.tap ? { tap: window.__andar.tap } : {}), mesa: atTable?.mesa ?? null, rideRefusals, shop: shopHere?.id ?? null, othersOnScreen: onScreen, shoulder, sair: sairRef.current?.probe() ?? null, hand: hand?.item ?? null, at: performance.now(), x, z, speed, ready: true, seated: sit > 0.9, emote: emote?.kind ?? null, action, lift, jumps: air.count, riding: ride ? ride.route : null, sounds: sound?.played ?? 0, names: district.names?.shown ?? 0, waited: district.traffic?.waited ?? 0, trafficFollowed: district.traffic?.followed ?? false, othersRiding: session?.othersRiding() ?? 0, myRide: session?.myRide ?? null, hired: corridas.current?.probe() ?? null, streetNow: district.streetNow, vans: (district.traffic?.seen ?? []).map((van) => ({ key: `${van.route}/${van.index}`, x: van.x, z: van.z })), tangled: district.traffic?.tangled ?? 0, heeding: district.traffic?.heeding ?? 0, linked: session?.walking ?? false, players: session?.count ?? 0, corrections: session?.corrections ?? 0, channel: session?.channel ?? null, known: session?.known ?? 0, net: session?.state ?? "alone", reconnections: session?.reconnections ?? 0, fall: () => session?.fall(), talk: session?.canTalk ?? false, balloons: over?.shown ?? 0, lines: (session?.talk.lines(performance.now(), true) ?? []).map((line) => `${line.who ?? "eu"}: ${line.text}`), gestures: session?.gesturing() ?? [], others: district.others.map((one) => ({ x: one.x, z: one.z, name: one.name, still: one.still })), nearestVehicle: Math.min(Infinity, ...[...(district.traffic?.seen ?? []), ...(district.traffic?.roaming ?? [])].map((vehicle) => Math.hypot(vehicle.x - x, vehicle.z - z))) };
        if (now - lastHud > 120) {
          // How near the bay and how near traffic, for the sea and the road in the ear: the ground is asked
          // outward from where the player stands.
          const cell = (dx: number, dz: number): number => ground.flagsAt(Math.floor(((x + dx) * 1000) / ground.cellMm), Math.floor(((z + dz) * 1000) / ground.cellMm));
          let water = 0;
          let traffic = ride ? 1 : 0;
          for (let d = 0; d <= 48 && water === 0; d += 4) if (cell(0, -d) & CELL_WATER) water = 1 - d / 52;
          for (let d = 0; d <= 24 && traffic === 0; d += 3) if ((cell(0, d) | cell(0, -d) | cell(d, 0) | cell(-d, 0)) & CELL_DRIVE) traffic = 1 - d / 28;
          sound?.ambience(water, traffic);
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
          if (errands) marks.push(...errands.marks(x, z));
          if (sairRef.current) marks.push(...sairRef.current.marks(x, z));
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
          // `&semrede` shows what a minute without a network looks like, for a still.
          setHud({ talk: session?.canTalk ?? false, lines: session?.talk.lines(performance.now()) ?? [], refused: performance.now() < refusedUntil ? refusedWhy : null, cash: account()?.wallet?.cash ?? account()?.origin?.makuta ?? 0, net: params.has("semrede") ? "lost" : (session?.state ?? "alone"), out: session?.out ?? null, said: said && performance.now() < said.until ? { kind: said.kind, name: said.name, amount: said.amount ?? 0 } : null, ready: true, place: district.word(district.manifest.nameKey), second, heading, marks, action, ride: band, stick: { x: stick.originX - rect.left, y: stick.originY - rect.top, dx: stick.x / 1.5 / length, dy: stick.y / 1.5 / length, active: stick.active } });
        }
      }
      renderer.render(elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // The lower third on the thumb's side is the stick, wherever the thumb lands; everywhere else turns the camera.
    const touches = new Map<number, { kind: "stick" | "look"; x: number; y: number; fromX: number; fromY: number; at: number }>();
    const down = (event: PointerEvent): void => {
      sound?.wake();
      const rect = element.getBoundingClientRect();
      const across = (event.clientX - rect.left) / rect.width;
      const inZone = event.pointerType !== "mouse" && (across < 0.5) !== world.settings.leftHanded && event.clientY - rect.top > rect.height * 0.45;
      const kind = inZone && !stick.active ? "stick" : "look";
      touches.set(event.pointerId, { kind, x: event.clientX, y: event.clientY, fromX: event.clientX, fromY: event.clientY, at: performance.now() });
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
      // A tap, not a drag: on a player, it opens their BI, with everything that can be done about them (Rule 11).
      // What came of the last one is kept for the tests: "stick", "long", "moved", "nobody", "unknown" or "opened".
      const tap = (why: string): void => void (window.__andar && (window.__andar.tap = why));
      if (touch && touch.kind !== "look") tap("stick");
      else if (touch && performance.now() - touch.at >= 350) tap("long");
      else if (touch && Math.hypot(event.clientX - touch.fromX, event.clientY - touch.fromY) >= 10) tap("moved");
      if (touch?.kind === "look" && session && performance.now() - touch.at < 350 && Math.hypot(event.clientX - touch.fromX, event.clientY - touch.fromY) < 10) {
        const rect = element.getBoundingClientRect();
        const entity = touched(renderer.camera, session.heads(), event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
        const who = entity === null ? null : session.who(entity);
        tap(entity === null ? "nobody" : who ? "opened" : "unknown");
        if (entity !== null && who) setMet({ entity, name: who.name, bi: who.bi });
      }
    };
    const keyDown = (event: KeyboardEvent): void => {
      sound?.wake();
      // At a biscato the keys are the work's: Space rubs, it does not jump.
      if (working.current) return;
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
      stopWatch();
      cancelAnimationFrame(frame);
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("resize", onResize);
      unwatch();
      sound?.close();
      errands?.close();
      errandsRef.current = null;
      tables?.close();
      tablesRef.current = null;
      cabin.dispose();
      session?.close();
      net.current = null;
      over?.close();
      person?.dispose();
      district?.close();
      renderer.dispose();
    };
  }, []);

  return (
    <main class={`andar${leftHanded ? " andar-left" : ""}${biscato ? " andar-working" : ""}`}>
      <canvas ref={canvas} class="andar-canvas" />
      <div ref={overBox} class="cv-over" aria-hidden="true" />
      {(!hud.ready && !missing) || params.has("chegar") ? <Arriving poupanca={settings.poupanca} /> : null}
      {install && Oferta ? (
        <Oferta onYes={() => (setInstall(false), sessionStorage.setItem("nzila.install", "1"), void offer.current?.prompt?.())} onLater={() => (setInstall(false), sessionStorage.setItem("nzila.install", "1"))} />
      ) : null}
      {missing ? <p class="andar-note">pnpm pack:dev (Blender)</p> : null}
      {hud.ready ? (
        <div class="andar-hud n-on-dark">
          <div class="andar-top">
            <span>
              <WalletChip amount={hud.cash} />
              {Needs ? <Needs net={net} world={world} onMark={setMarked} /> : null}
              {hud.ride && Viagem ? <Viagem ride={hud.ride} /> : null}
              {Corrida && corridas.current ? <Corrida.Chip net={net} corridas={corridas.current} /> : null}
              {SairM && sairRef.current ? <SairM.Chip sair={sairRef.current} net={net} corrida={loadCorrida} /> : null}
            </span>
            <span class="andar-top-right">
              <Compass heading={hud.heading} marks={hud.marks} />
              <ClockChip secondOfDay={hud.second} />
            </span>
          </div>
          {hud.net === "reconnecting" ? (
            <div class="andar-net">
              <Banner>{tr.t("state.reconnecting")}</Banner>
            </div>
          ) : null}
          {hud.net === "lost" ? (
            <div class="andar-net">
              <Banner state="stopped">{tr.t("state.offline")}</Banner>
              <Button kind="quiet" onPress={() => retryNet.current()}>
                {tr.t("state.retry")}
              </Button>
            </div>
          ) : null}
          {hud.said && hud.net === "linked" ? (
            <div class="andar-net">
              <Banner state={hud.said.kind === "met" || hud.said.kind === "got" || hud.said.kind === "dito" || hud.said.kind === "recado" ? "done" : hud.said.kind === "recadoNo" ? "stopped" : "moving"}>
                {hud.said.kind === "dito" ? hud.said.name : hud.said.kind === "recado" ? tr.t("recado.obrigado", { who: hud.said.name, amount: tr.makuta(hud.said.amount) }) : hud.said.kind === "recadoNo" ? tr.t(`recado.said.${hud.said.name}` as "recado.said.none") : tr.t(hud.said.kind === "got" ? "pay.got" : hud.said.kind === "met" ? "meet.done" : hud.said.kind === "greeted" ? "meet.greeted" : "meet.waved", { name: hud.said.name, amount: tr.makuta(hud.said.amount) })}
              </Banner>
            </div>
          ) : null}
          {hud.net === "out" ? (
            <div class="andar-net">
              <Banner state="stopped">{hud.out?.kind === "ban" ? tr.t("state.banned") : hud.out?.until ? tr.t("state.suspended", { when: new Date(hud.out.until).toLocaleString("pt-AO", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) }) : tr.t("state.suspended.some")}</Banner>
            </div>
          ) : null}
          {arrived && !hud.ride ? <Arrival place={hud.place} /> : null}
          <Joystick {...hud.stick} />
          <div class="andar-buttons">
            <span class="andar-pair">
              <HudButton glyph="mochila" label={tr.t("hud.mochila")} on={bag} onPress={() => (setShop(null), setBag(!bag))} />
              <span class="andar-badged">
                <HudButton glyph="telemovel" label={tr.t("hud.phone")} on={phone} onPress={() => setPhone(!phone)} />
                {novas ? <b class="n-badge">{novas > 9 ? "9+" : novas}</b> : null}
              </span>
            </span>
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
          {biscato && Trabalho ? <Trabalho net={net} place={biscato.name} onClose={() => (setBiscato(null), setTrabalho(null))} /> : null}
          <LazyPhone world={world} open={phone} first={phoneApp} marked={marked} onMark={setMarked} abrir={abrirKamba} onClose={() => (setPhone(false), setPhoneApp(null), setAbrirKamba(null))} ir={async (kind, to) => {
            const why = await (await loadCorrida()).pedir(net, kind, to);
            if (why === null) setPhone(false);
            return why;
          }} />
          {/* The Telemóvel covers the foot of the screen: the chat bar steps aside while it is open, or it would lie over the sheet's last key. */}
          {phone || met || shop || bag ? null : <ChatLog lines={hud.lines} refused={hud.refused} raised={composing && hud.talk} />}
          {phone || met || shop || bag ? null : (
            <div class="andar-chat">
              {composing && hud.talk ? (
                <Composer onSay={(text) => net.current?.say(text)} onTyping={(on) => net.current?.typing(on)} onClose={() => setComposing(false)} />
              ) : (
                <ChatBar disabled={!hud.talk} onOpen={() => setComposing(true)} />
              )}
            </div>
          )}
          {shop ? <LazyLoja show={(loja) => <loja.Cantina shop={shop} second={hud.second} place={hud.place} onClose={() => (setShop(null), void errandsRef.current?.mochila())} />} /> : null}
          {bag && !shop ? <LazyLoja show={(loja) => <loja.Mochila zone={net.current} onClose={() => setBag(false)} />} /> : null}
          {tablesRef.current ? <tablesRef.current.Ui mesas={tablesRef.current} mesa={table} gesto={(kind) => (asks.current.emote = kind)} /> : null}
          {SairM && sairRef.current && !met && !shop && !bag && !phone ? <SairM.Ui sair={sairRef.current} net={net} /> : null}
          {CampoM && campo.current && campo.current !== "loading" ? <CampoM.Ui bolas={campo.current} /> : null}
          {EntreM && porta ? <EntreM.Viagem porta={porta} portas={entre.current && entre.current !== "loading" ? entre.current.portas : []} onClose={() => setPorta(null)} leave={() => net.current?.leave()} go={(pack, arrive) => location.assign(`/andar?pack=${pack}&paragem=${arrive}`)} /> : null}
          {met ? (
            <LazySheet
              met={met}
              silenced={net.current?.talk.silenced(met.entity) ?? false}
              onSilence={(on) => (net.current?.silence(met.entity, on), setMet({ ...met }))}
              onShutOut={(on) => net.current?.talk.silence(met.entity, on)}
              onGave={() => net.current?.nudge(met.bi)}
              jogos={tablesRef.current?.jogos() ?? []}
              onConvidar={(jogo) => tablesRef.current?.convidar(jogo, met.entity)}
              lugares={sairRef.current?.lugares ?? []}
              onSair={(lugar) => sairRef.current?.convidar(net, met.entity, lugar)}
              onGesto={sairRef.current ? (gesto) => (sairRef.current?.oferecer(net, met.entity, gesto), setMet(null)) : undefined}
              onEscrever={(bi) => (setMet(null), setAbrirKamba(bi), setPhoneApp("mensagens"), setPhone(true))}
              onTalk={() => (setMet(null), setComposing(true))}
              onClose={() => setMet(null)}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
