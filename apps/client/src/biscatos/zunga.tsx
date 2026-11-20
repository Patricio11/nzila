// Zunga (Task 4.5, D-4.22): a bacia on the head along the Marginal. Passers-by walk up one at a time, each with a
// little bubble of what they want; the thumb gives it from the bacia before they walk on. The wrong thing, and they
// go without buying. The round comes from the seed the zone gave (`@nzila/sim/zunga`), and the taps are read here
// by the zone's own rule, so what the screen shows is what the zone will count.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ZUNGA_COMING_MS, ZUNGA_GAP_MS, ZUNGA_GOODS, zungaRound } from "@nzila/sim/zunga";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Moldura, Rondas, useRonda, type Linha, type Trabalho } from "./ronda.tsx";

/** How long a passer-by takes to walk off, in milliseconds. */
const LEAVING_MS = 700;

/** A thing from the bacia, drawn: banana, ginguba in paper cones, a bag of water, bread. */
function Coisa({ what }: { what: number }) {
  return <span class={`bz-coisa bz-${ZUNGA_GOODS[what] ?? "pao"}`} aria-hidden="true" />;
}

/** The round being played: the promenade, the passer-by, and the bacia. */
function Jogo({ seed, lengthMs, ronda }: { seed: number; lengthMs: number; ronda: ReturnType<typeof useRonda> }) {
  const clients = useMemo(() => zungaRound(seed, lengthMs), [seed, lengthMs]);
  // The zone's rule, kept here as the taps are made: who is answered, whether they bought, and when they left.
  const state = useRef({ next: 0, lastTap: -ZUNGA_GAP_MS, sold: 0, answered: new Map<number, { sold: boolean; at: number }>() });
  const [, redraw] = useState(0);

  const give = (what: number): void => {
    const s = state.current;
    const t = ronda.add(what);
    if (t < 0 || t - s.lastTap < ZUNGA_GAP_MS) return;
    s.lastTap = t;
    while (s.next < clients.length && clients[s.next]!.until < t) s.next += 1;
    const client = clients[s.next];
    if (!client || t < client.from) return;
    const sold = what === client.want;
    s.answered.set(s.next, { sold, at: t });
    if (sold) s.sold += 1;
    s.next += 1;
    redraw((n) => n + 1);
  };

  useEffect(() => {
    const tick = setInterval(() => {
      if (ronda.now() >= lengthMs) ronda.end();
      redraw((n) => n + 1);
    }, 60);
    return () => clearInterval(tick);
  }, [lengthMs]);

  // A keyboard too: 1 to 4, the bacia's places.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      const n = Number(event.key);
      if (!(n >= 1 && n <= ZUNGA_GOODS.length)) return;
      event.preventDefault();
      give(n - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const t = ronda.now();
  const s = state.current;
  // Who is on the promenade now: walking up, standing, or walking off.
  const shown = clients.flatMap((client, i) => {
    const answer = s.answered.get(i);
    const leaveAt = answer ? answer.at : client.until;
    if (t < client.from - ZUNGA_COMING_MS || t > leaveAt + LEAVING_MS) return [];
    const left = t < client.from ? 108 - ((t - (client.from - ZUNGA_COMING_MS)) / ZUNGA_COMING_MS) * 54 : t < leaveAt ? 54 : 54 - ((t - leaveAt) / LEAVING_MS) * 80;
    return [{ i, client, answer, left, waiting: t >= client.from && t < leaveAt }];
  });
  return (
    <Moldura title={tr.t("action.zunga")} goal={tr.t("biscato.zunga.objetivo")} secondsLeft={(lengthMs - t) / 1000} totalSeconds={lengthMs / 1000} done={tr.t("biscato.zunga.vendidos", { n: s.sold })} onLeave={ronda.end}>
      <div class="bz">
        <div class="bz-cena" aria-hidden="true">
          <span class="bz-mar" />
          <span class="bz-passeio" />
          {shown.map(({ i, client, answer, left, waiting }) => (
            <span key={i} class={`bz-cliente bz-roupa-${i % 4}${waiting ? "" : " bz-anda"}`} style={{ left: `${left}%` }}>
              {waiting ? (
                <span class="bz-quer">
                  <Coisa what={client.want} />
                  <i style={{ transform: `scaleX(${Math.max(0, (client.until - t) / (client.until - client.from)).toFixed(3)})` }} />
                </span>
              ) : answer ? (
                <span class={`bz-diz${answer.sold ? " bz-vendeu" : ""}`}>{tr.t(answer.sold ? "biscato.zunga.obrigado" : "biscato.zunga.errado")}</span>
              ) : null}
              <span class="bz-cabeca" />
              <span class="bz-corpo" />
              <span class="bz-pernas" />
            </span>
          ))}
        </div>
        <div class="bz-bacia">
          {ZUNGA_GOODS.map((good, n) => (
            <button type="button" class="bz-tocar" aria-label={tr.t(`biscato.zunga.${good}` as "biscato.zunga.banana")} onPointerDown={() => give(n)}>
              <Coisa what={n} />
              <small>{tr.t(`biscato.zunga.${good}` as "biscato.zunga.banana")}</small>
            </button>
          ))}
        </div>
      </div>
    </Moldura>
  );
}

/** Zunga: its work and its words. */
const ZUNGA: Trabalho = {
  kind: "zunga",
  title: tr.t("action.zunga"),
  play: ({ seed, lengthMs, ronda }) => <Jogo seed={seed} lengthMs={lengthMs} ronda={ronda} />,
  // Who bought, and who walked on without: only those who came while it was played.
  said: ({ done, failed }) => `${tr.t(done === 1 ? "biscato.zunga.fim1" : "biscato.zunga.fim", { feitas: done })}${failed > 0 ? ` ${tr.t(failed === 1 ? "biscato.zunga.foi1" : "biscato.zunga.foram", { n: failed })}` : ""}`,
  hint: ({ failed, done }) => tr.t(failed > done ? "biscato.zunga.dica.olha" : "biscato.zunga.dica.rapido"),
};

/** Zunga, as the street opens it. */
export function Biscato({ net, place, onClose }: { net: Linha; place: string; onClose: () => void }) {
  return <Rondas net={net} place={place} work={ZUNGA} onClose={onClose} />;
}
