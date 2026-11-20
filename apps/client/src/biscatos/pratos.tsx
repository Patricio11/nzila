// Lavar pratos (Task 4.5, D-4.22): at the tia's kiosk, the plates of the lunch pile up beside a red bacia. The thumb
// rubs the plate in the water, back and forth, and each rub takes a stain; clean, the plate shines and a flick to
// the right (or a tap on the escorredor) puts it up. Up dirty, the tia sends it back. Fetched when the button is
// pressed, with the round's rules (`@nzila/sim/pratos`), the same the zone scores it by.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { PRATOS_FLICK, PRATOS_RUB, RUB_GAP_MS, pratosRound, type Prato } from "@nzila/sim/pratos";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Fim, Moldura, Recusado, useRonda, type Linha } from "./ronda.tsx";

/** How far a thumb travels one way before turning back for that to be a rub, in pixels. */
const RUB_TRAVEL_PX = 14;
/** A flick: this far to the right, in one stroke without turning back, in pixels. */
const FLICK_PX = 64;
/** How long the tia's word stays up, in milliseconds. */
const SAID_MS = 2600;

/** Where a plate's stains are, as fractions of its face: the same for the same plate. */
function stains(plate: number, dirt: number): { x: number; y: number; r: number }[] {
  return Array.from({ length: dirt }, (_, n) => {
    const a = (plate * 2.39 + n * 2.0) % (Math.PI * 2);
    const d = 0.18 + ((plate * 7 + n * 13) % 5) * 0.045;
    return { x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d, r: 0.07 + ((plate + n) % 3) * 0.025 };
  });
}

/** The plate in the water: white enamel, a blue rim, and what is left of its stains. */
function PratoNaAgua({ plate, dirtLeft, dirt, shine }: { plate: number; dirtLeft: number; dirt: number; shine: boolean }) {
  const spots = stains(plate, dirt);
  return (
    <svg class={`bp-prato${shine ? " bp-brilha" : ""}`} viewBox="0 0 100 100" aria-hidden="true">
      <circle class="bp-aba" cx="50" cy="50" r="46" />
      <circle class="bp-esmalte" cx="50" cy="50" r="40" />
      <circle class="bp-fundo" cx="50" cy="50" r="27" />
      {/* An enamel plate that has lived: the rim chipped in a place or two. */}
      <ellipse class="bp-lasca" cx={50 + Math.cos(plate * 1.7) * 43} cy={50 + Math.sin(plate * 1.7) * 43} rx="3.2" ry="2.2" />
      {plate % 3 === 0 ? <ellipse class="bp-lasca" cx={50 + Math.cos(plate * 1.7 + 2.4) * 43} cy={50 + Math.sin(plate * 1.7 + 2.4) * 43} rx="2.2" ry="1.6" /> : null}
      {spots.map((spot, n) => (
        <ellipse class={`bp-nodoa${n >= dirtLeft ? " bp-saiu" : ""}`} cx={spot.x * 100} cy={spot.y * 100} rx={spot.r * 100} ry={spot.r * 78} transform={`rotate(${(plate * 37 + n * 53) % 180} ${spot.x * 100} ${spot.y * 100})`} />
      ))}
      {shine ? <path class="bp-luz" d="M30 28 Q40 20 54 22" /> : null}
    </svg>
  );
}

/** The round being played: the pile, the bacia, the escorredor, and what the thumb does. */
function Jogo({ seed, lengthMs, ronda }: { seed: number; lengthMs: number; ronda: ReturnType<typeof useRonda> }) {
  const plates = useMemo<Prato[]>(() => pratosRound(seed, lengthMs), [seed, lengthMs]);
  // The round as this phone sees it, by the same rules the zone will replay.
  const state = useRef({ next: 0, dirtLeft: plates[0]?.dirt ?? 0, clean: 0, dirty: 0, lastRub: -RUB_GAP_MS, streak: 0 });
  const [, redraw] = useState(0);
  const [said, setSaid] = useState<{ text: string; until: number } | null>(null);
  // Each rub that takes a stain makes a little foam.
  const [foam, setFoam] = useState(0);
  const tia = (key: string): void => setSaid({ text: tr.t(key as "biscato.pratos.tia.bem"), until: performance.now() + SAID_MS });
  const t = ronda.now();
  const s = state.current;
  const landed = plates.filter((plate) => t >= plate.at).length;
  const inWater = s.next < landed ? plates[s.next]! : null;
  const pile = Math.max(0, landed - s.next - 1);

  const rub = (): void => {
    const now = ronda.now();
    if (!inWater || now - s.lastRub < RUB_GAP_MS) return;
    s.lastRub = now;
    ronda.add(PRATOS_RUB);
    if (s.dirtLeft > 0) {
      s.dirtLeft -= 1;
      setFoam((n) => n + 1);
    }
    redraw((n) => n + 1);
  };
  const flick = (): void => {
    if (!inWater) return;
    ronda.add(PRATOS_FLICK);
    if (s.dirtLeft === 0) {
      s.clean += 1;
      s.streak += 1;
      if (s.streak % 5 === 0) tia("biscato.pratos.tia.bem");
    } else {
      s.dirty += 1;
      s.streak = 0;
      tia("biscato.pratos.tia.sujo");
    }
    s.next += 1;
    s.dirtLeft = plates[s.next]?.dirt ?? 0;
    redraw((n) => n + 1);
  };

  // The round's clock and the pile's word.
  useEffect(() => {
    let warned = false;
    const tick = setInterval(() => {
      const now = ronda.now();
      const waiting = plates.filter((plate) => now >= plate.at).length - state.current.next;
      if (waiting >= 6 && !warned) {
        warned = true;
        tia("biscato.pratos.tia.pilha");
      } else if (waiting < 4) warned = false;
      if (now >= lengthMs) ronda.end();
      redraw((n) => n + 1);
    }, 100);
    return () => clearInterval(tick);
  }, [plates, lengthMs]);

  // A keyboard too: space rubs, Enter or the right arrow puts the plate up.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === " ") rub();
      else if (event.key === "Enter" || event.key === "ArrowRight") flick();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // A stroke of the thumb: each turn back after enough travel is a rub; one long stroke right with no turn, a flick.
  const stroke = useRef<{ x: number; turnAt: number; dir: number; startX: number; turned: boolean } | null>(null);
  const thumb = {
    onPointerDown: (event: PointerEvent): void => {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      stroke.current = { x: event.clientX, turnAt: event.clientX, dir: 0, startX: event.clientX, turned: false };
    },
    onPointerMove: (event: PointerEvent): void => {
      const one = stroke.current;
      if (!one) return;
      const dir = Math.sign(event.clientX - one.x);
      if (dir !== 0 && one.dir !== 0 && dir !== one.dir) {
        if (Math.abs(one.x - one.turnAt) >= RUB_TRAVEL_PX) {
          rub();
          one.turned = true;
        }
        one.turnAt = one.x;
      }
      if (dir !== 0) one.dir = dir;
      one.x = event.clientX;
    },
    onPointerUp: (event: PointerEvent): void => {
      const one = stroke.current;
      stroke.current = null;
      if (one && !one.turned && event.clientX - one.startX >= FLICK_PX) flick();
    },
    onPointerCancel: (): void => void (stroke.current = null),
  };

  const secondsLeft = (lengthMs - t) / 1000;
  return (
    <Moldura title={tr.t("action.pratos")} goal={tr.t("biscato.pratos.objetivo")} secondsLeft={secondsLeft} totalSeconds={lengthMs / 1000} done={tr.t("biscato.pratos.limpos", { n: s.clean })} onLeave={ronda.end}>
      <div class="bp">
        <div class="bp-pilha" aria-label={tr.t("biscato.pratos.pilha", { n: pile })}>
          {Array.from({ length: Math.min(pile, 7) }, (_, n) => (
            <i style={{ bottom: `${n * 9}px` }} />
          ))}
          <small>{tr.t("biscato.pratos.pilha", { n: pile })}</small>
        </div>
        <div class="bp-bacia" {...thumb}>
          <span class="bp-agua" aria-hidden="true" />
          {inWater ? <PratoNaAgua key={s.next} plate={s.next} dirt={inWater.dirt} dirtLeft={s.dirtLeft} shine={s.dirtLeft === 0} /> : <p class="bp-vazia">{tr.t("biscato.pratos.espera")}</p>}
          {foam > 0 ? <span key={foam} class={`bp-espuma bp-espuma-${foam % 3}`} aria-hidden="true" /> : null}
          {inWater ? <span class="bp-dica">{tr.t(s.dirtLeft > 0 ? "biscato.pratos.esfrega" : "biscato.pratos.atira")}</span> : null}
        </div>
        <button type="button" class="bp-escorredor" aria-label={tr.t("biscato.pratos.escorredor")} onClick={flick}>
          {Array.from({ length: Math.min(s.clean, 9) }, (_, n) => (
            <i style={{ left: `${10 + n * 9}%` }} />
          ))}
          <small>{tr.t("biscato.pratos.escorredor")}</small>
        </button>
        {said && performance.now() < said.until ? <p class="bp-tia">{said.text}</p> : null}
      </div>
    </Moldura>
  );
}

/** One round: asked of the zone, played, scored, paid. */
function Ronda({ net, place, onAgain, onClose }: { net: Linha; place: string; onAgain: () => void; onClose: () => void }) {
  const ronda = useRonda(net, "pratos");
  const fase = ronda.fase;
  const title = tr.t("action.pratos");
  if (fase.is === "recusado") return <Recusado title={title} why={fase.why} onBack={onClose} />;
  if (fase.is === "fim") {
    const said = fase.dirty > 0 ? tr.t("biscato.pratos.fim.sujos", { limpos: fase.clean, pratos: fase.plates, sujos: fase.dirty }) : tr.t("biscato.pratos.fim", { limpos: fase.clean, pratos: fase.plates });
    const hint = tr.t(fase.dirty > 0 ? "biscato.pratos.dica.sujo" : "biscato.pratos.dica.rapido");
    return <Fim title={tr.t("biscato.fim.titulo")} place={place} line={title} said={said} hint={hint} score={fase.score} paga={ronda.paga} onAgain={onAgain} onBack={onClose} />;
  }
  if (fase.is === "jogo") return <Jogo seed={fase.seed} lengthMs={fase.lengthMs} ronda={ronda} />;
  return (
    <div class="bc bc-fim" role="dialog" aria-label={title}>
      <p class="bc-espera">{tr.t(fase.is === "pedido" ? "biscato.pedido" : "biscato.contas")}</p>
    </div>
  );
}

/** Lavar pratos, as the street opens it: round after round until the player goes back to the street. */
export function Biscato({ net, place, onClose }: { net: Linha; place: string; onClose: () => void }) {
  const [n, setN] = useState(0);
  return <Ronda key={n} net={net} place={place} onAgain={() => setN((was) => was + 1)} onClose={onClose} />;
}
