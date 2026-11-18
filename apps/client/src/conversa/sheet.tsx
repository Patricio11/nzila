// The sheet of someone met in the street (Rule 11): their BI and everything that can be done about them, on one
// sheet. Fetched the first time someone is tapped, not before (the megabytes rule, F-188).

import { ptAO, ptAOTranslator as tr } from "@nzila/i18n";
import { Button, Glyph, IdCard } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { arrivedOn } from "../telemovel/bi.tsx";
import { Coisa } from "../cantina/coisas.tsx";
import { giveThing, thingsNow, type GaveThing, type Held, payPlayer, type Paid, blockPlayer, playerCard, reportPlayer, type PlayerCard, type ReportReason } from "../world/account.ts";
import { type Met } from "./conversa.tsx";
import "./conversa.css";

const REASONS: readonly ReportReason[] = ["insults", "harassment", "sexual", "scam", "cheating", "name", "other"];

/**
 * Someone met in the street: their BI, and what can be done. Report, block and mute are here with "Falar", on the
 * one sheet, because a way to talk never comes without them (Rule 11).
 */
export function PlayerSheet({ met, silenced, onSilence, onShutOut, onTalk, onClose, onGave = () => {} }: { met: Met; silenced: boolean; onSilence: (on: boolean) => void; onShutOut: (on: boolean) => void; onTalk: () => void; onClose: () => void; onGave?: () => void }) {
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
    if (met.bi) void playerCard(met.bi).then((found) => alive && setCard(found));
    return () => void (alive = false);
  }, [met.bi]);

  const bairro = card?.bairro ? (`origin.bairro.${card.bairro}` in ptAO ? tr.t(`origin.bairro.${card.bairro}` as "origin.bairro.maianga") : card.bairro) : tr.t("bi.nobairro");
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
              {tr.t(`give.said.${handed.said}`, { name: met.name, item: handed.item ? tr.t(`item.${handed.item}` as "item.pao") : "" })}
            </p>
          ) : null}
          {offering ? (
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
              <Button kind="quiet" onPress={() => (setSaid(null), setGave(null), setHanded(null), setGiving(true))}>
                {tr.t("pay.open")}
              </Button>
              <Button kind="quiet" onPress={() => void offer()}>
                {tr.t("give.open")}
              </Button>
              <Button kind="quiet" disabled>
                {tr.t("player.add")}
              </Button>
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
