// The sheet of someone met in the street (Rule 11): their BI and everything that can be done about them, on one
// sheet. Fetched the first time someone is tapped, not before (the megabytes rule, F-188).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { Button, Glyph, IdCard, type GlyphName } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { arrivedOn } from "../telemovel/bi.tsx";
import { Coisa } from "../cantina/coisas.tsx";
import { giveThing, thingsNow, type GaveThing, type Held, payPlayer, type Paid, blockPlayer, playerCard, reportPlayer, type PlayerCard, type ReportReason } from "../world/money.ts";
import { pedir, responder, type EntreNos } from "../telemovel/rede-kambas.ts";
import { type Met } from "./conversa.tsx";
import "./conversa.css";
import "./sheet.css";
import "@nzila/ui/later.css";

// The words of this sheet came with it (F-195).
tr.extend(ptAOLater);

const REASONS: readonly ReportReason[] = ["insults", "harassment", "sexual", "scam", "cheating", "name", "other"];

/**
 * Someone met in the street: their BI, and what can be done. Report, block and mute are here with "Falar", on the
 * one sheet, because a way to talk never comes without them (Rule 11).
 */
export function PlayerSheet({ met, silenced, onSilence, onShutOut, onTalk, onClose, onGave = () => {}, jogos = [], onConvidar, onEscrever, lugares = [], onSair, onGesto }: { met: Met; silenced: boolean; onSilence: (on: boolean) => void; onShutOut: (on: boolean) => void; onTalk: () => void; onClose: () => void; onGave?: () => void; jogos?: readonly string[]; onConvidar?: (jogo: string) => void; onEscrever?: (bi: string) => void; lugares?: readonly { readonly id: string; readonly nome: string; readonly a: string; readonly glyph: string }[]; onSair?: (lugar: number) => void; onGesto?: ((gesto: number) => void) | undefined }) {
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [shut, setShut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [said, setSaid] = useState<"report.sent" | "report.offline" | "player.shut" | "player.heard" | null>(null);
  // Handing them Makuta: the form, the amount, and what came of it.
  const [giving, setGiving] = useState(false);
  const [amount, setAmount] = useState("");
  const [gave, setGave] = useState<{ said: Paid; days?: number; left?: number; amount?: number } | null>(null);
  // Handing them a thing from the Mochila: what is carried, and what came of it.
  const [offering, setOffering] = useState<readonly Held[] | null>(null);
  const [handed, setHanded] = useState<{ said: GaveThing; item: string } | null>(null);
  // Inviting them to play at a table (Task 4B.1): the choice of game, and the game asked.
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState<string | null>(null);
  // Asking them out (Task 10.13): the choice of place, and the place asked.
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState<number | null>(null);
  // Kambas (Task 4B.2): where the two stand, and what asking came to.
  const [kamba, setKamba] = useState<EntreNos>("nada");
  const [kambaSaid, setKambaSaid] = useState<string | null>(null);
  const add = async (): Promise<void> => {
    setBusy(true);
    setKambaSaid(null);
    if (kamba === "pedido_recebido") {
      const done = await responder(met.bi, true);
      if (done === "kambas") setKamba("kambas");
      setKambaSaid(done === "kambas" ? tr.t("kamba.aceite", { nome: met.name }) : tr.t(`kamba.pedir.${done === "offline" ? "offline" : "fechado"}`, { nome: met.name }));
    } else {
      const done = await pedir(met.bi);
      if (done === "kambas" || done === "ja") setKamba("kambas");
      else if (done === "pedido") setKamba("pedido_enviado");
      setKambaSaid(tr.t(`kamba.pedir.${done}`, { nome: met.name }));
    }
    setBusy(false);
  };
  const offer = async (): Promise<void> => {
    setSaid(null);
    setGave(null);
    setHanded(null);
    setOffering([]);
    const now = await thingsNow();
    setOffering(now ? now.items : []);
    if (!now) setHanded({ said: "offline", item: "" });
  };
  const hand = async (item: string): Promise<void> => {
    setBusy(true);
    const answer = await giveThing(met.bi, item);
    setBusy(false);
    setHanded({ said: answer.said, item });
    if (answer.said === "ok") {
      onGave();
      setOffering(null);
    }
  };
  const give = async (): Promise<void> => {
    setBusy(true);
    const sum = Number(amount);
    const answer = await payPlayer(met.bi, sum);
    setBusy(false);
    setGave({ ...answer, amount: sum });
    if (answer.said === "ok") {
      onGave();
      setGiving(false);
      setAmount("");
    }
  };
  useEffect(() => {
    let alive = true;
    if (met.bi)
      void playerCard(met.bi).then((found) => {
        if (!alive) return;
        setCard(found);
        if (found?.kamba) setKamba(found.kamba);
      });
    return () => void (alive = false);
  }, [met.bi]);

  const bairro = card?.bairro ? (`origin.bairro.${card.bairro}` in ptAOLater ? tr.t(`origin.bairro.${card.bairro}` as "origin.bairro.maianga") : card.bairro) : tr.t("bi.nobairro");
  const shutOut = async (): Promise<void> => {
    setBusy(true);
    const done = await blockPlayer(met.bi, !shut);
    setBusy(false);
    if (!done) return setSaid("report.offline");
    setShut(!shut);
    onShutOut(!shut);
    setSaid(!shut ? "player.shut" : "player.heard");
  };
  const report = async (): Promise<void> => {
    if (!reason) return;
    setBusy(true);
    const done = await reportPlayer(met.bi, reason, note);
    setBusy(false);
    setSaid(done ? "report.sent" : "report.offline");
    if (done) setReporting(false);
  };

  return (
    <div class="cv-sheet-back" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section class="cv-sheet n-on-dark" role="dialog" aria-label={met.name}>
        <span class="n-pano-faixa n-pano-faixa-vermelha" aria-hidden="true" />
        <div class="cv-sheet-in">
          <IdCard name={met.name} number={met.bi} bairro={bairro} arrived={card ? arrivedOn(card.arrivedAt) : ""} photo={<Glyph name="bi" size={40} />} />
          {said ? (
            <p class="cv-said" role="status">
              {tr.t(said)}
            </p>
          ) : null}
          {gave ? (
            <p class="cv-said" role="status">
              {tr.t(`pay.said.${gave.said}`, { name: met.name, amount: tr.makuta(gave.amount ?? 0), days: gave.days ?? 0, left: tr.makuta(gave.left ?? 0) })}
            </p>
          ) : null}
          {handed ? (
            <p class="cv-said" role="status">
              {tr.t(`give.said.${handed.said}`, { name: met.name, item: handed.item ? tr.t(`item.${handed.item}.um` as "item.pao.um") : "" })}
            </p>
          ) : null}
          {kambaSaid ? (
            <p class="cv-said" role="status">
              {kambaSaid}
            </p>
          ) : null}
          {invited ? (
            <p class="cv-said" role="status">
              {tr.t("convite.enviado", { name: met.name, jogo: tr.t(`mesa.jogo.${invited}` as "mesa.jogo.xadrez") })}
            </p>
          ) : null}
          {asked !== null && lugares[asked] ? (
            <p class="cv-said" role="status">
              {tr.t("sair.enviado", { name: met.name, a: lugares[asked]!.a })}
            </p>
          ) : null}
          {asking ? (
            <div class="cv-report">
              <h3>{tr.t("sair.titulo", { name: met.name })}</h3>
              <div class="cv-lugares">
                {lugares.map((lugar, n) => (
                  <button key={lugar.id} type="button" class="cv-lugar" data-lugar={lugar.id} onClick={() => (onSair?.(n), setAsked(n), setAsking(false))}>
                    <span class="cv-lugar-sinal" aria-hidden="true">
                      <Glyph name={lugar.glyph as GlyphName} size={26} />
                    </span>
                    <span>{lugar.nome}</span>
                  </button>
                ))}
              </div>
              <div class="cv-keys">
                <Button kind="quiet" onPress={() => setAsking(false)}>
                  {tr.t("report.cancel")}
                </Button>
              </div>
            </div>
          ) : inviting ? (
            <div class="cv-report">
              <h3>{tr.t("convite.titulo", { name: met.name })}</h3>
              <div class="cv-games">
                {jogos.map((jogo) => (
                  <button key={jogo} type="button" class="cv-game" data-jogo={jogo} onClick={() => (onConvidar?.(jogo), setInvited(jogo), setInviting(false))}>
                    <i class={`cv-game-mark cv-game-${jogo}`} aria-hidden="true" />
                    <span>{tr.t(`mesa.jogo.${jogo}` as "mesa.jogo.xadrez")}</span>
                  </button>
                ))}
              </div>
              <div class="cv-keys">
                <Button kind="quiet" onPress={() => setInviting(false)}>
                  {tr.t("report.cancel")}
                </Button>
              </div>
            </div>
          ) : offering ? (
            <div class="cv-report">
              <h3>{tr.t("give.title", { name: met.name })}</h3>
              {offering.length === 0 ? (
                <p class="cv-said">{tr.t("give.none")}</p>
              ) : (
                <div class="cv-things">
                  {offering.map((one) => (
                    <button key={one.item} type="button" class="cv-thing" disabled={busy} onClick={() => void hand(one.item)} data-item={one.item}>
                      <Coisa item={one.item} size={40} />
                      <span>{tr.t(`item.${one.item}` as "item.pao")}</span>
                      <b class="n-num">{one.quantity}</b>
                    </button>
                  ))}
                </div>
              )}
              <div class="cv-keys">
                <Button kind="quiet" onPress={() => setOffering(null)}>
                  {tr.t("report.cancel")}
                </Button>
              </div>
            </div>
          ) : giving ? (
            <div class="cv-report">
              <h3>{tr.t("pay.title", { name: met.name })}</h3>
              <input class="cv-note" type="text" inputMode="numeric" autocomplete="off" aria-label={tr.t("bank.amount")} placeholder={tr.t("bank.amount")} value={amount} maxLength={12} onInput={(event) => setAmount(event.currentTarget.value.replace(/\D/g, "").replace(/^0+/, ""))} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()} />
              <p class="cv-said">{tr.t("pay.note")}</p>
              <div class="cv-keys">
                <Button kind="quiet" onPress={() => setGiving(false)}>
                  {tr.t("report.cancel")}
                </Button>
                <Button disabled={!(Number(amount) > 0)} busy={busy} onPress={() => void give()}>
                  {tr.t("pay.go")}
                </Button>
              </div>
            </div>
          ) : reporting ? (
            <div class="cv-report">
              <h3>{tr.t("report.title")}</h3>
              <div class="cv-reasons" role="radiogroup" aria-label={tr.t("report.title")}>
                {REASONS.map((one) => (
                  <button key={one} type="button" role="radio" aria-checked={reason === one} class={`cv-chip${reason === one ? " cv-chip-on" : ""}`} onClick={() => setReason(one)}>
                    {tr.t(`report.reason.${one}`)}
                  </button>
                ))}
              </div>
              <textarea class="cv-note" value={note} maxLength={500} rows={3} placeholder={tr.t("report.note")} aria-label={tr.t("report.note")} onInput={(event) => setNote(event.currentTarget.value)} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()} />
              <div class="cv-keys">
                <Button kind="quiet" onPress={() => setReporting(false)}>
                  {tr.t("report.cancel")}
                </Button>
                <Button disabled={!reason} busy={busy} onPress={() => void report()}>
                  {tr.t("report.send")}
                </Button>
              </div>
            </div>
          ) : (
            <div class="cv-actions">
              <Button onPress={onTalk}>{tr.t("action.talk")}</Button>
              {jogos.length > 0 && onConvidar ? (
                <span class="cv-convite">
                  <Button kind="quiet" onPress={() => (setSaid(null), setGave(null), setHanded(null), setInvited(null), setInviting(true))}>
                    {tr.t("convite.abrir")}
                  </Button>
                </span>
              ) : null}
              {onGesto ? (
                <Button kind="quiet" onPress={() => onGesto(0)}>
                  {tr.t("adois.apertar")}
                </Button>
              ) : null}
              {onGesto && card?.sair ? (
                <Button kind="quiet" onPress={() => onGesto(1)}>
                  {tr.t("adois.abracar")}
                </Button>
              ) : null}
              {card?.sair && lugares.length > 0 && onSair ? (
                <span class="cv-convite cv-sair">
                  <Button kind="quiet" onPress={() => (setSaid(null), setGave(null), setHanded(null), setInvited(null), setAsked(null), setAsking(true))}>
                    {tr.t("sair.abrir")}
                  </Button>
                </span>
              ) : null}
              <Button kind="quiet" onPress={() => (setSaid(null), setGave(null), setHanded(null), setGiving(true))}>
                {tr.t("pay.open")}
              </Button>
              <Button kind="quiet" onPress={() => void offer()}>
                {tr.t("give.open")}
              </Button>
              {kamba === "kambas" ? (
                <Button kind="quiet" disabled={!onEscrever} onPress={() => onEscrever?.(met.bi)}>
                  {tr.t("kamba.escrever")}
                </Button>
              ) : (
                <Button kind="quiet" busy={busy} disabled={kamba === "pedido_enviado"} onPress={() => void add()}>
                  {kamba === "nada" ? tr.t("player.add") : tr.t(`kamba.estado.${kamba}`)}
                </Button>
              )}
              <Button kind="quiet" onPress={() => onSilence(!silenced)}>
                {tr.t(silenced ? "player.unmute" : "player.mute")}
              </Button>
              <Button kind="quiet" busy={busy} onPress={() => void shutOut()}>
                {tr.t(shut ? "player.unblock" : "player.block")}
              </Button>
              <Button kind="quiet" onPress={() => (setSaid(null), setReporting(true))}>
                {tr.t("player.report")}
              </Button>
              <Button kind="quiet" onPress={onClose}>
                {tr.t("player.close")}
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
