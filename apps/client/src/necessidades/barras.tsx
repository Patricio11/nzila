// Fome and Energia on the screen (Task 4.4, UX_UI_SPEC.md §2 `<NeedsBars>` and "When Fome or Energia falls"). The
// zone keeps them and says them (EVENT.NECESSIDADES); this draws them. It is fetched by the street only once a need
// first falls under half, so that a player who eats in time never downloads it (the way in is full: F-226).
//
// Two thin bars under the wallet chip, hidden while both are above half. A line, said once each time it becomes
// true: too tired to go fast or to jump, and hungry under a fifth, with the nearest cantina and how far it is; and the
// compass points to it (the gold mark, when the player has not marked a place of their own). And at zero, the hospital: a fade, what happened,
// the bill as a receipt, and back to the street (UX_UI_SPEC.md: "never a death screen").

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { Button, NeedsBars, Receipt } from "@nzila/ui";
import type { Marked } from "../telemovel/telemovel.tsx";
import { askAsPlayer } from "../world/account.ts";
import { nearestFood, type Arredores } from "./comida.ts";
import { useEffect, useRef, useState } from "preact/hooks";
import "./barras.css";

// The words of this came with it.
tr.extend(ptAOLater);

/** What the zone last said of the player's needs, or null before it has. */
export type NeedsSaid = { readonly fome: number; readonly energia: number; readonly tired: boolean } | null;

/** Under this much Fome, the player is told they are hungry: a fifth of the bar. */
const HUNGRY_BELOW = 2000;
/** How long a line stays up, in milliseconds. */
const LINE_MS = 6000;

/** A stay at the hospital's bill, as the API wrote it. */
export interface Conta {
  readonly at: string;
  readonly total: number;
  readonly id: number;
}

/**
 * Woken at the hospital: the screen fades up from dark on what happened, the bill as a receipt (nothing taken from
 * a purse that had nothing), and the way back to the street. `conta` is null while the bill is asked, "sem-rede"
 * when it could not be.
 */
export function Hospital({ conta, onBack }: { conta: Conta | null | "sem-rede"; onBack: () => void }) {
  return (
    <div class="nd-hospital" role="dialog" aria-label={tr.t("needs.hospital.titulo")}>
      <div class="nd-hospital-in">
        <span class="n-pano-faixa n-pano-faixa-vermelha" aria-hidden="true" />
        <h2>{tr.t("needs.hospital.titulo")}</h2>
        <p>{tr.t("needs.hospital.texto")}</p>
        {conta === "sem-rede" ? (
          <p class="nd-hospital-nota">{tr.t("needs.hospital.semRede")}</p>
        ) : conta && conta.total > 0 ? (
          <Receipt title={tr.t("needs.hospital.recibo")} lines={[{ label: tr.t("needs.hospital.consulta"), amount: conta.total }]} total={conta.total} at={new Date(conta.at).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })} place={tr.t("needs.hospital.recibo")} reference={`H-${conta.id}`} />
        ) : conta ? (
          <p class="nd-hospital-nota">{tr.t("needs.hospital.nada")}</p>
        ) : null}
        <Button onPress={onBack}>{tr.t("needs.hospital.voltar")}</Button>
      </div>
    </div>
  );
}

/**
 * The bars, and the line when there is one: what the session last heard, read twice a second. `onMark` sets the
 * compass's gold mark (the Mapa's): to the nearest cantina as hunger comes, unless the player has marked a place of
 * their own, and away again once they have eaten.
 */
export function Necessidades({ net, world, onMark }: { net: { readonly current: { readonly needs: NeedsSaid; hospital: string | null } | null }; world?: Arredores; onMark?: (next: (was: Marked | null) => Marked | null) => void }) {
  const read = (): NeedsSaid => net.current?.needs ?? null;
  const [now, setNow] = useState<NeedsSaid>(read());
  const [line, setLine] = useState<string | null>(null);
  const was = useRef({ tired: false, hungry: false });
  const stayRef = useRef<string | null>(null);
  // The cantina this put on the compass, to take it off again (and only it).
  const food = useRef<Marked | null>(null);
  // A stay at the hospital the zone just told of, and its bill once asked.
  const [stay, setStay] = useState<string | null>(null);
  const [conta, setConta] = useState<Conta | null | "sem-rede">(null);
  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    let then: ReturnType<typeof setTimeout> | undefined;
    // One line, or two one after the other when both became true at once: hunger first, then tiredness.
    const say = (text: string, after?: string): void => {
      setLine(text);
      clearTimeout(hide);
      clearTimeout(then);
      hide = setTimeout(() => setLine(null), LINE_MS);
      if (after) then = setTimeout(() => say(after), LINE_MS);
    };
    const look = (): void => {
      const there = net.current?.hospital ?? null;
      if (there && there !== stayRef.current) {
        stayRef.current = there;
        setStay(there);
        setConta(null);
        void askAsPlayer<{ receipt: Conta }>("POST", "/v1/hospital/conta").then(({ answer }) => setConta(answer ? answer.receipt : "sem-rede"));
      }
      const needs = read();
      setNow(needs);
      if (!needs) return;
      const hungry = needs.fome < HUNGRY_BELOW;
      // Each said once as it becomes true: not again until it has stopped being so.
      const tiredNow = needs.tired && !was.current.tired;
      if (hungry && !was.current.hungry) {
        const near = world ? nearestFood(world) : null;
        say(near ? tr.t("needs.fome", { metros: near.metres }) : tr.t("needs.fome.semCantina"), tiredNow ? tr.t("needs.cansado") : undefined);
        if (near && onMark) {
          const mark = { x: near.x, z: near.z, name: near.name };
          food.current = mark;
          onMark((marked) => marked ?? mark);
        }
      } else if (tiredNow) say(tr.t("needs.cansado"));
      if (!hungry && was.current.hungry && food.current && onMark) {
        const mine = food.current;
        food.current = null;
        onMark((marked) => (marked === mine ? null : marked));
      }
      was.current = { tired: needs.tired, hungry };
    };
    look();
    const every = setInterval(look, 500);
    return () => {
      clearInterval(every);
      clearTimeout(hide);
      clearTimeout(then);
    };
  }, [net, world, onMark]);
  if (stay) {
    return (
      <Hospital
        conta={conta}
        onBack={() => {
          if (net.current) net.current.hospital = null;
          setStay(null);
        }}
      />
    );
  }
  if (!now) return null;
  return (
    <div class="nd">
      <NeedsBars fome={now.fome} energia={now.energia} />
      {line ? (
        <p class="nd-line" role="status">
          {line}
        </p>
      ) : null}
    </div>
  );
}
