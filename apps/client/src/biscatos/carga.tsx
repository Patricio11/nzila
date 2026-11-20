// Levar carga (Task 4.5, D-4.22): the roboteiro at the paragem. A carrinho stacked with what came off the vans goes
// from the paragem to the stall in the market; the road bumps the stack and a lean grows by itself; a tap on the
// left or the right pushes it back. The stack sways by the same steps the zone replays (`@nzila/sim/carga`), from
// the same taps, at the same times. Fetched when the button is pressed.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { CARGA_EDGE, CARGA_LEFT, CARGA_RIGHT, CARGA_STEP_MS, CARGA_TRIP_MM, cargaRoad, cargaStart, cargaStep, type CargaInput } from "@nzila/sim/carga";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Moldura, Rondas, useRonda, type Linha, type Trabalho } from "./ronda.tsx";

/** How long a word from the stall stays up, in milliseconds. */
const SAID_MS = 2400;
/** What a stack is made of, from the bottom: a sack of fuba, a crate of tomato, a bidão of oil, again and again. */
const LOADS = ["saco", "grade", "bidao", "saco", "grade", "saco", "bidao"] as const;

/** The round being played: the road to the stall, the carrinho and its stack, and the two halves to tap. */
function Jogo({ seed, lengthMs, ronda }: { seed: number; lengthMs: number; ronda: ReturnType<typeof useRonda> }) {
  const road = useMemo(() => cargaRoad(seed, lengthMs), [seed, lengthMs]);
  const state = useRef(cargaStart());
  const inputs = useRef<CargaInput[]>([]);
  const [, redraw] = useState(0);
  const [said, setSaid] = useState<{ text: string; until: number } | null>(null);
  const word = (key: string): void => setSaid({ text: tr.t(key as "biscato.carga.caiu"), until: performance.now() + SAID_MS });

  const tap = (what: typeof CARGA_LEFT | typeof CARGA_RIGHT): void => {
    const t = ronda.add(what);
    if (t >= 0) inputs.current.push({ t, what });
  };

  // The world steps as the zone's does: every 50 ms of the round's own time, with the taps made in it.
  useEffect(() => {
    let delivered = 0;
    let fell = 0;
    const tick = setInterval(() => {
      const s = state.current;
      const upTo = Math.min(Math.floor(ronda.now() / CARGA_STEP_MS), Math.floor(lengthMs / CARGA_STEP_MS));
      while (s.step < upTo) cargaStep(s, road, inputs.current);
      if (s.fallen > fell) {
        fell = s.fallen;
        word("biscato.carga.caiu");
      }
      if (s.delivered > delivered) {
        delivered = s.delivered;
        word("biscato.carga.entregue");
      }
      if (ronda.now() >= lengthMs) ronda.end();
      redraw((n) => n + 1);
    }, 50);
    return () => clearInterval(tick);
  }, [road, lengthMs]);

  // A keyboard too: the arrows, or A and D.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      const k = event.key.toLowerCase();
      if (k === "arrowleft" || k === "a") tap(CARGA_LEFT);
      else if (k === "arrowright" || k === "d") tap(CARGA_RIGHT);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const s = state.current;
  const danger = Math.abs(s.lean) > CARGA_EDGE * 0.6;
  // Fallen, the stack lies by the carrinho while it is gathered up.
  const fallen = s.justFell && s.still > 0;
  return (
    <Moldura title={tr.t("action.carga")} goal={tr.t("biscato.carga.objetivo")} secondsLeft={(lengthMs - ronda.now()) / 1000} totalSeconds={lengthMs / 1000} done={tr.t("biscato.carga.entregues", { n: s.delivered })} onLeave={ronda.end}>
      <div class="bg">
        <div class="bg-caminho" aria-hidden="true">
          <span class="bg-ponta">{tr.t("biscato.carga.paragem")}</span>
          <span class="bg-linha">
            <i class="bg-onde" style={{ left: `${(s.along / CARGA_TRIP_MM) * 100}%` }} />
          </span>
          <span class="bg-ponta bg-banca">
            {tr.t("biscato.carga.banca")}
            <b>{Array.from({ length: Math.min(s.delivered, 8) }, () => "▪").join("")}</b>
          </span>
        </div>
        <div class={`bg-carrinho${danger ? " bg-perigo" : ""}${fallen ? " bg-caiu" : ""}`} aria-hidden="true">
          <div class="bg-pilha" style={{ transform: `rotate(${(s.lean / 100).toFixed(2)}deg)` }}>
            {LOADS.slice(0, s.boxes).map((load, n) => (
              <i class={`bg-${load}`} style={{ zIndex: 10 - n }} />
            ))}
          </div>
          <span class="bg-cama" />
          <span class="bg-roda" style={{ transform: `rotate(${s.along / 3}deg)` }} />
          <span class="bg-pega" />
        </div>
        <button type="button" class="bg-toque bg-esquerda" aria-label={tr.t("biscato.carga.esquerda")} onPointerDown={() => tap(CARGA_LEFT)}>
          <i />
        </button>
        <button type="button" class="bg-toque bg-direita" aria-label={tr.t("biscato.carga.direita")} onPointerDown={() => tap(CARGA_RIGHT)}>
          <i />
        </button>
        {said && performance.now() < said.until ? <p class="bp-tia">{said.text}</p> : null}
      </div>
    </Moldura>
  );
}

/** Levar carga: its work and its words. */
const CARGA: Trabalho = {
  kind: "carga",
  title: tr.t("action.carga"),
  play: ({ seed, lengthMs, ronda }) => <Jogo seed={seed} lengthMs={lengthMs} ronda={ronda} />,
  said: ({ done, failed, most }) => tr.t(failed === 0 ? "biscato.carga.fim" : failed === 1 ? "biscato.carga.fim.caiu1" : "biscato.carga.fim.caiu", { feitas: done, todas: most, caidas: failed }),
  hint: ({ failed }) => tr.t(failed > 0 ? "biscato.carga.dica.caiu" : "biscato.carga.dica.bem"),
};

/** Levar carga, as the street opens it. */
export function Biscato({ net, place, onClose }: { net: Linha; place: string; onClose: () => void }) {
  return <Rondas net={net} place={place} work={CARGA} onClose={onClose} />;
}
