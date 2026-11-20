// Lavar carros (Task 4.5, D-4.22): the lavadores by the road, with a bucket and a sponge. A car pulls in dusty with
// mud on some of its parts; the thumb sweeps the sponge over them, and each pass takes a layer; clean all over, the
// car drives off and the next in the queue pulls in. The washing follows the zone's own rule (`@nzila/sim/carros`)
// as the passes are made, so what the screen shows is what the zone will count.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { CARRO_PARTS, DRIVE_OFF_MS, carrosPass, carrosRound, carrosStart } from "@nzila/sim/carros";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Moldura, Rondas, useRonda, type Linha, type Trabalho } from "./ronda.tsx";

/** How far the sponge travels one way before turning back for that to be a pass over the same part, in pixels. */
const TURN_PX = 14;

/** The round being played: the queue, the car in the washing place, the sponge. */
function Jogo({ seed, lengthMs, ronda }: { seed: number; lengthMs: number; ronda: ReturnType<typeof useRonda> }) {
  const cars = useMemo(() => carrosRound(seed, lengthMs), [seed, lengthMs]);
  const state = useRef(carrosStart(cars));
  const [, redraw] = useState(0);
  const [sponge, setSponge] = useState<{ x: number; y: number; n: number } | null>(null);
  const washedAt = useRef(-DRIVE_OFF_MS * 2);

  const pass = (part: number): void => {
    const s = state.current;
    const t = ronda.add(part);
    if (t < 0) return;
    const before = s.washed;
    carrosPass(s, cars, { t, what: part });
    if (s.washed > before) washedAt.current = t;
    redraw((n) => n + 1);
  };

  useEffect(() => {
    const tick = setInterval(() => {
      if (ronda.now() >= lengthMs) ronda.end();
      redraw((n) => n + 1);
    }, 80);
    return () => clearInterval(tick);
  }, [lengthMs]);

  // A keyboard too: 1 to 8, the parts.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      const n = Number(event.key);
      if (!(n >= 1 && n <= CARRO_PARTS)) return;
      event.preventDefault();
      pass(n - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // The sponge: a pass each time it comes onto a part, or turns back on one after going far enough.
  const stroke = useRef<{ part: number; x: number; turnAt: number; dir: number } | null>(null);
  const partAt = (event: PointerEvent): { part: number; x: number; y: number } => {
    const box = (event.currentTarget as Element).getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const col = Math.max(0, Math.min(3, Math.floor((x / box.width) * 4)));
    return { part: (y < box.height * 0.5 ? 0 : 4) + col, x, y };
  };
  const thumb = {
    onPointerDown: (event: PointerEvent): void => {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      const at = partAt(event);
      stroke.current = { part: at.part, x: event.clientX, turnAt: event.clientX, dir: 0 };
      setSponge({ x: at.x, y: at.y, n: 0 });
      pass(at.part);
    },
    onPointerMove: (event: PointerEvent): void => {
      const one = stroke.current;
      if (!one) return;
      const at = partAt(event);
      setSponge((was) => ({ x: at.x, y: at.y, n: was ? was.n : 0 }));
      if (at.part !== one.part) {
        one.part = at.part;
        one.turnAt = event.clientX;
        one.dir = 0;
        setSponge({ x: at.x, y: at.y, n: Math.random() });
        return pass(at.part);
      }
      const dir = Math.sign(event.clientX - one.x);
      if (dir !== 0 && one.dir !== 0 && dir !== one.dir && Math.abs(one.x - one.turnAt) >= TURN_PX) {
        one.turnAt = one.x;
        setSponge({ x: at.x, y: at.y, n: Math.random() });
        pass(at.part);
      }
      if (dir !== 0) one.dir = dir;
      one.x = event.clientX;
    },
    onPointerUp: (): void => {
      stroke.current = null;
      setSponge(null);
    },
    onPointerCancel: (): void => {
      stroke.current = null;
      setSponge(null);
    },
  };

  const t = ronda.now();
  const s = state.current;
  const car = cars[s.car];
  const inPlace = car !== undefined && t >= Math.max(car.arrives, s.inAt);
  const queue = Math.max(0, cars.filter((one) => t >= one.arrives).length - s.car - (inPlace ? 1 : 0));
  const leaving = t - washedAt.current < DRIVE_OFF_MS;
  return (
    <Moldura title={tr.t("action.carros")} goal={tr.t("biscato.carros.objetivo")} secondsLeft={(lengthMs - t) / 1000} totalSeconds={lengthMs / 1000} done={tr.t("biscato.carros.lavados", { n: s.washed })} onLeave={ronda.end}>
      <div class="bk">
        <p class="bk-fila">{tr.t("biscato.carros.fila", { n: queue })}</p>
        <div class="bk-lugar" {...thumb}>
          <span class="bk-chao" aria-hidden="true" />
          {leaving ? (
            <span key={`sai-${s.washed}`} class={`bk-carro bk-cor-${(s.car - 1) % 5} bk-sai`} aria-hidden="true">
              <span class="bk-cabine" />
              <span class="bk-roda bk-roda-1" />
              <span class="bk-roda bk-roda-2" />
            </span>
          ) : null}
          {inPlace && car ? (
            <span key={`carro-${s.car}`} class={`bk-carro bk-cor-${s.car % 5}`} aria-hidden="true">
              <span class="bk-cabine" />
              <span class="bk-roda bk-roda-1" />
              <span class="bk-roda bk-roda-2" />
              {s.dirt.map((layers, part) => (layers > 0 ? <i class={`bk-lama bk-parte-${part}`} style={{ opacity: 0.3 + layers * 0.175 }} /> : null))}
            </span>
          ) : null}
          {sponge ? <span class="bk-esponja" style={{ left: `${sponge.x}px`, top: `${sponge.y}px` }} aria-hidden="true" /> : null}
          {sponge && sponge.n > 0 ? <span key={sponge.n} class="bp-espuma" style={{ left: `${sponge.x}px`, top: `${sponge.y}px` }} aria-hidden="true" /> : null}
          {leaving ? <p class="bp-tia">{tr.t("biscato.carros.dono")}</p> : null}
        </div>
      </div>
    </Moldura>
  );
}

/** Lavar carros: its work and its words. */
const CARROS: Trabalho = {
  kind: "carros",
  title: tr.t("action.carros"),
  play: ({ seed, lengthMs, ronda }) => <Jogo seed={seed} lengthMs={lengthMs} ronda={ronda} />,
  said: ({ done, failed }) => `${tr.t(done === 1 ? "biscato.carros.fim1" : "biscato.carros.fim", { feitos: done })}${failed > 0 ? ` ${tr.t(failed === 1 ? "biscato.carros.ficou1" : "biscato.carros.ficaram", { n: failed })}` : ""}`,
  hint: ({ failed }) => tr.t(failed > 0 ? "biscato.carros.dica.lento" : "biscato.carros.dica.bem"),
};

/** Lavar carros, as the street opens it. */
export function Biscato({ net, place, onClose }: { net: Linha; place: string; onClose: () => void }) {
  return <Rondas net={net} place={place} work={CARROS} onClose={onClose} />;
}
