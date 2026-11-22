// Mensagens (UX_UI_SPEC.md §4): for now, what the bairro asks of the player today (os recados do dia), the
// family's word in the morning, the errand for two, what the bairro has today, and its festa. Each is a message
// from somebody, the way the chat everyone uses looks. Fetched when first opened (F-188).

import { ptAOTranslator as tr, type MessageKey } from "@nzila/i18n";
import { Button } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { Kambas } from "./kambas.tsx";
import { novidadesAgora, onNovidades } from "./rede-kambas.ts";
import { errandPlaces } from "@nzila/world/lugares";
import { familia, feito, messageOf, onToday, placeIn, today, whoOf, type FeitoSaid, type Recado, type Today } from "../recados/recados.ts";
import { type WorldProvider } from "../world/provider.ts";
import type { Marked } from "./telemovel.tsx";
import "./mensagens.css";

/** A face for a sender: the initial of their name (not of "Tia" or "Kota") on a colour of their own. */
function Face({ name, tone }: { name: string; tone: number }) {
  return (
    <span class={`ms-face ms-tone-${tone % 5}`} aria-hidden="true">
      {(name.split(" ").pop() ?? name).slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Mensagens: two tabs, the kambas and the bairro today. It opens on the kambas when something waits there. */
export function Mensagens({ world, marked, onMark, abrir = null }: { world: WorldProvider; marked: Marked | null; onMark: (place: Marked | null) => void; abrir?: string | null }) {
  const [novas, setNovas] = useState(novidadesAgora());
  const [aba, setAba] = useState<"kambas" | "bairro">(abrir || novidadesAgora().pedidos + novidadesAgora().porLer > 0 ? "kambas" : "bairro");
  useEffect(() => onNovidades(setNovas), []);
  const waiting = novas.pedidos + novas.porLer;
  return (
    <>
      <div class="kb-abas" role="tablist">
        <button type="button" role="tab" class="kb-aba" aria-selected={aba === "kambas"} onClick={() => setAba("kambas")}>
          {tr.t("kamba.aba")}
          {waiting > 0 && aba !== "kambas" ? <b>{waiting > 9 ? "9+" : waiting}</b> : null}
        </button>
        <button type="button" role="tab" class="kb-aba" aria-selected={aba === "bairro"} onClick={() => setAba("bairro")}>
          {tr.t("kamba.abaBairro")}
        </button>
      </div>
      {aba === "kambas" ? <Kambas world={world} onMark={onMark} abrir={abrir} /> : <Bairro world={world} marked={marked} onMark={onMark} />}
    </>
  );
}

/** What the bairro asks of the player today, the family's word, the errand for two, what the bairro has, its festa. */
function Bairro({ world, marked, onMark }: { world: WorldProvider; marked: Marked | null; onMark: (place: Marked | null) => void }) {
  const [day, setDay] = useState<Today | null>(null);
  const [offline, setOffline] = useState(false);
  const [said, setSaid] = useState<{ n: number | "familia"; text: string } | null>(null);
  const [busy, setBusy] = useState<number | "familia" | null>(null);
  useEffect(() => {
    let alive = true;
    void today(true).then((now) => alive && (now ? setDay(now) : setOffline(true)));
    const stop = onToday((now) => alive && setDay(now));
    return () => {
      alive = false;
      stop();
    };
  }, []);
  const manifest = world.district();
  const placeOf = (one: Recado): Marked | null => {
    const poi = placeIn(errandPlaces(manifest?.pois ?? []), one.place);
    return poi ? { x: poi.pos[0], z: poi.pos[2], name: world.word(poi.nameKey) } : null;
  };
  const done = async (one: Recado): Promise<void> => {
    setBusy(one.n);
    const answer = await feito(one.n);
    setBusy(null);
    setSaid({ n: one.n, text: answer.said === "ok" ? tr.t("recado.obrigado", { who: whoOf(one.who), amount: tr.makuta(answer.pay ?? 0) }) : tr.t(`recado.said.${answer.said as Exclude<FeitoSaid, "ok">}`) });
  };
  const thanks = async (): Promise<void> => {
    setBusy("familia");
    const answer = await familia();
    setBusy(null);
    setSaid({ n: "familia", text: answer.said === "offline" ? tr.t("recado.said.offline") : tr.t("recado.familia.done", { amount: tr.makuta(answer.amount ?? day?.familia.amount ?? 0) }) });
  };

  if (!day) return <p class="tm-note">{offline ? tr.t("recado.said.offline") : tr.t("recado.lendo")}</p>;
  return (
    <div class="ms">
      <article class="ms-msg ms-familia">
        <Face name={tr.t("recado.familia.who")} tone={4} />
        <div class="ms-body">
          <b>{tr.t("recado.familia.who")}</b>
          <p class="ms-bubble">{tr.t("recado.familia")}</p>
          {day.familia.casa ? <p class="ms-bubble">{tr.t(day.familia.casa.here ? "recado.familia.casa" : "recado.familia.casa.longe", { n: day.familia.casa.house, em: tr.t(`origin.bairro.${day.familia.casa.pack}.em` as MessageKey) })}</p> : null}
          {day.familia.done ? (
            <small class="ms-done">{tr.t("recado.feito", { amount: tr.makuta(day.familia.amount) })}</small>
          ) : (
            <Button busy={busy === "familia"} onPress={() => void thanks()}>
              {`${tr.t("recado.familia.ok")} · ${tr.makuta(day.familia.amount)}`}
            </Button>
          )}
          {said?.n === "familia" ? <small class="ms-said" role="status">{said.text}</small> : null}
        </div>
      </article>
      {day.recados.map((one) => {
        const place = placeOf(one);
        const isMarked = place !== null && marked !== null && marked.x === place.x && marked.z === place.z;
        return (
          <article key={one.n} class={one.done ? "ms-msg ms-feito" : "ms-msg"} data-kind={one.kind}>
            <Face name={whoOf(one.who)} tone={one.who} />
            <div class="ms-body">
              <b>{whoOf(one.who)}</b>
              <p class="ms-bubble">{messageOf(one)}</p>
              {place && !one.done ? (
                <button type="button" class={isMarked ? "ms-place ms-place-on" : "ms-place"} onClick={() => onMark(isMarked ? null : place)}>
                  {isMarked ? tr.t("recado.marcado") : tr.t("recado.marcar")}
                  <span>{place.name}</span>
                </button>
              ) : null}
              {one.done ? (
                <small class="ms-done">{tr.t("recado.feito.so")}</small>
              ) : one.kind === "guarda" || one.kind === "cumprimenta" ? (
                <Button kind="quiet" busy={busy === one.n} onPress={() => void done(one)}>
                  {tr.t("recado.jafiz")}
                </Button>
              ) : (
                <small class="ms-pay">{tr.t("recado.paga", { amount: tr.makuta(day.next) })}</small>
              )}
              {said?.n === one.n ? <small class="ms-said" role="status">{said.text}</small> : null}
            </div>
          </article>
        );
      })}
      <article class={day.aDois.done ? "ms-msg ms-feito" : "ms-msg"}>
        <Face name={tr.t("recado.adois.who")} tone={2} />
        <div class="ms-body">
          <b>{tr.t("recado.adois.who")}</b>
          <p class="ms-bubble">{tr.t("recado.adois")}</p>
          <small class={day.aDois.done ? "ms-done" : "ms-pay"}>{day.aDois.done ? tr.t("recado.feito", { amount: tr.makuta(day.aDois.pay) }) : tr.t("recado.paga", { amount: tr.makuta(day.aDois.pay) })}</small>
        </div>
      </article>
      <section class="ms-banda">
        <span class="n-pano-faixa n-pano-faixa-vermelha" aria-hidden="true" />
        <h3>{tr.t("banda.title")}</h3>
        <p>{tr.t(day.apagao ? "banda.apagao" : "banda.calmo")}</p>
        <h3>{tr.t("festa.title")}</h3>
        <span class="ms-festa" aria-hidden="true">
          <i style={{ width: `${Math.min(100, (day.festa.done / day.festa.goal) * 100)}%` }} />
        </span>
        <p>{day.festa.done >= day.festa.goal ? tr.t("festa.pronta") : tr.t("festa.line", { done: day.festa.done, goal: day.festa.goal })}</p>
      </section>
    </div>
  );
}
