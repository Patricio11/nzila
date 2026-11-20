// What every biscato's screen shares (Task 4.5, D-4.22; UX_UI_SPEC.md §5.3): asking the zone to begin, the round's
// clock, the thumb's inputs sent in batches as it goes, the end (at the time, or "Sair" at any moment), the score
// as the zone gives it, and the pay as the API writes it. The screen of each biscato draws its own work inside the
// frame, and tells this what the thumb did.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { EVENT, encodeBiscato, type WorldEvent } from "@nzila/protocol";
import { Button, Receipt } from "@nzila/ui";
import { type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { askAsPlayer } from "../world/account.ts";
import "./biscatos.css";

// The words of this came with it.
tr.extend(ptAOLater);

/** What a biscato's screen needs of the street's line to the zone. */
export interface Linha {
  readonly current: { biscatos: WorldEvent[]; post(bytes: Uint8Array): void } | null;
}

/** How often the thumb's inputs go to the zone while the round runs, in milliseconds. */
const SEND_EVERY_MS = 1500;
/** The most inputs in one batch (the protocol's BISCATO_BATCH_MAX). */
const BATCH = 256;

/** How a round stands. */
export type Fase =
  | { readonly is: "pedido" }
  | { readonly is: "recusado"; readonly why: string }
  | { readonly is: "jogo"; readonly seed: number; readonly lengthMs: number }
  | { readonly is: "contas" }
  | { readonly is: "fim"; readonly score: number; readonly clean: number; readonly dirty: number; readonly plates: number };

/** A biscato's pay, as the API wrote it. */
export interface Paga {
  readonly receipt: { readonly id: number; readonly at: string; readonly total: number };
  readonly percent: number;
}

/**
 * A round of a biscato, from asking the zone to being paid. `add` takes what the thumb did, at the round's time
 * now; `now` is that time, in milliseconds from the round's start.
 */
export function useRonda(net: Linha, kind: string) {
  const [fase, setFase] = useState<Fase>({ is: "pedido" });
  const [paga, setPaga] = useState<Paga | "sem-rede" | null>(null);
  const began = useRef(0);
  const pending = useRef<{ t: number; what: number }[]>([]);
  const ended = useRef(false);
  const send = (): void => {
    while (pending.current.length > 0) net.current?.post(encodeBiscato({ op: "mais", inputs: pending.current.splice(0, BATCH) }));
  };
  const end = (): void => {
    if (ended.current) return;
    ended.current = true;
    send();
    net.current?.post(encodeBiscato({ op: "acabar" }));
    setFase((was) => (was.is === "jogo" ? { is: "contas" } : was));
  };
  useEffect(() => {
    net.current?.post(encodeBiscato({ op: "comecar", kind }));
    const listen = setInterval(() => {
      for (const event of net.current?.biscatos.splice(0) ?? []) {
        if (event.kind === EVENT.BISCATO) {
          began.current = performance.now();
          setFase({ is: "jogo", seed: event.args[0] ?? 0, lengthMs: event.args[1] ?? 0 });
        } else if (event.kind === EVENT.BISCATO_RECUSADO) setFase({ is: "recusado", why: event.text });
        else if (event.kind === EVENT.BISCATO_FIM) {
          const [score = 0, clean = 0, dirty = 0, plates = 0] = event.args;
          setFase({ is: "fim", score, clean, dirty, plates });
          if (score > 0) void askAsPlayer<Paga>("POST", "/v1/biscatos/pagar").then(({ answer }) => setPaga(answer ?? "sem-rede"));
        }
      }
    }, 100);
    const batches = setInterval(send, SEND_EVERY_MS);
    return () => {
      clearInterval(listen);
      clearInterval(batches);
      // Left without saying so (the page closed): what was done is still the zone's to score.
      if (!ended.current && began.current > 0) end();
    };
  }, [net, kind]);
  return {
    fase,
    paga,
    now: (): number => performance.now() - began.current,
    /** Tells the zone what the thumb did, now; gives back the time it was told at (the round's own time), or -1 once over. */
    add: (what: number): number => {
      if (ended.current) return -1;
      const t = Math.round(performance.now() - began.current);
      pending.current.push({ t, what });
      return t;
    },
    end,
  };
}

/** The frame every biscato is drawn in: its name and goal, the time left, what is done so far, and "Sair". */
export function Moldura({ title, goal, secondsLeft, totalSeconds, done, onLeave, children }: { title: string; goal: string; secondsLeft: number; totalSeconds: number; done: string; onLeave: () => void; children: ComponentChildren }) {
  const left = Math.max(0, Math.ceil(secondsLeft));
  return (
    <div class="bc" role="dialog" aria-label={title}>
      <header class="bc-head">
        <span class="n-pano-faixa" aria-hidden="true" />
        <div class="bc-row">
          <h2>{title}</h2>
          <button type="button" class="bc-sair" onClick={onLeave}>
            {tr.t("biscato.sair")}
          </button>
        </div>
        <p class="bc-goal">{goal}</p>
        <div class="bc-row">
          <span class="bc-clock" role="timer">
            <i style={{ width: `${Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100))}%` }} />
            <b>{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</b>
          </span>
          <span class="bc-done" role="status">
            {done}
          </span>
        </div>
      </header>
      <div class="bc-work">{children}</div>
    </div>
  );
}

/** The end of a round: what was done, what it paid as a receipt, what would have earned more, and the way back. */
export function Fim({ title, place, line, said, hint, score, paga, onAgain, onBack }: { title: string; place: string; line: string; said: string; hint: string; score: number; paga: Paga | "sem-rede" | null; onAgain: () => void; onBack: () => void }) {
  return (
    <div class="bc bc-fim" role="dialog" aria-label={title}>
      <div class="bc-fim-in">
        <span class="n-pano-faixa" aria-hidden="true" />
        <h2>{title}</h2>
        <p>{said}</p>
        {score === 0 ? (
          <p class="bc-nota">{tr.t("biscato.fim.nada")}</p>
        ) : paga === "sem-rede" ? (
          <p class="bc-nota">{tr.t("biscato.fim.semRede")}</p>
        ) : paga && paga.receipt.total > 0 ? (
          <>
            <Receipt title={place} lines={[{ label: line, amount: paga.receipt.total }]} total={paga.receipt.total} at={new Date(paga.receipt.at).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })} place={place} reference={`B-${paga.receipt.id}`} />
            {paga.percent < 100 ? <p class="bc-nota">{tr.t("biscato.fim.taper", { percent: paga.percent })}</p> : null}
          </>
        ) : (
          <p class="bc-nota">{tr.t("biscato.fim.contas")}</p>
        )}
        <p class="bc-dica">{hint}</p>
        <div class="bc-fim-buttons">
          <Button kind="quiet" onPress={onAgain}>
            {tr.t("biscato.outra")}
          </Button>
          <Button onPress={onBack}>{tr.t("biscato.voltar")}</Button>
        </div>
      </div>
    </div>
  );
}

/** What a biscato's screen gives the round: its title, its work, and what its end card says. */
export interface Trabalho {
  readonly kind: string;
  readonly title: string;
  /** The work itself, once the zone has given the round's seed and length. */
  play(round: { seed: number; lengthMs: number; ronda: ReturnType<typeof useRonda> }): ComponentChildren;
  /** What was done, and what would have earned more, from the zone's account of the round. */
  said(done: { done: number; failed: number; most: number }): string;
  hint(done: { done: number; failed: number; most: number }): string;
}

/** One round of a biscato: asked of the zone, played, scored, paid. */
function Ronda({ net, place, work, onAgain, onClose }: { net: Linha; place: string; work: Trabalho; onAgain: () => void; onClose: () => void }) {
  const ronda = useRonda(net, work.kind);
  const fase = ronda.fase;
  if (fase.is === "recusado") return <Recusado title={work.title} why={fase.why} onBack={onClose} />;
  if (fase.is === "fim") {
    const done = { done: fase.clean, failed: fase.dirty, most: fase.plates };
    return <Fim title={tr.t("biscato.fim.titulo")} place={place} line={work.title} said={work.said(done)} hint={work.hint(done)} score={fase.score} paga={ronda.paga} onAgain={onAgain} onBack={onClose} />;
  }
  if (fase.is === "jogo") return <>{work.play({ seed: fase.seed, lengthMs: fase.lengthMs, ronda })}</>;
  return (
    <div class="bc bc-fim" role="dialog" aria-label={work.title}>
      <p class="bc-espera">{tr.t(fase.is === "pedido" ? "biscato.pedido" : "biscato.contas")}</p>
    </div>
  );
}

/** A biscato as the street opens it: round after round until the player goes back to the street. */
export function Rondas({ net, place, work, onClose }: { net: Linha; place: string; work: Trabalho; onClose: () => void }) {
  const [n, setN] = useState(0);
  return <Ronda key={n} net={net} place={place} work={work} onAgain={() => setN((was) => was + 1)} onClose={onClose} />;
}

/** A round the zone would not begin: why, and the way back. */
export function Recusado({ title, why, onBack }: { title: string; why: string; onBack: () => void }) {
  return (
    <div class="bc bc-fim" role="dialog" aria-label={title}>
      <div class="bc-fim-in">
        <h2>{title}</h2>
        <p>{tr.t(`biscato.recusado.${why}` as "biscato.recusado.longe")}</p>
        <Button onPress={onBack}>{tr.t("biscato.voltar")}</Button>
      </div>
    </div>
  );
}
