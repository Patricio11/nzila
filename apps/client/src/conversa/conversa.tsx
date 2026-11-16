// Talk, as the player has it in their hand (Task 3.5, Rule 11): the line
// they type with the quick phrases over it, the last lines to read back, and
// the card of someone they met, with everything that can be done about them
// on the same sheet: talk, stop hearing, shut out, report.
//
// Nothing here knows about the zone. The page gives it what was said and is
// told what the player does.

import { ptAO, ptAOTranslator as tr } from "@nzila/i18n";
import { CHAT_MAX_CHARS } from "@nzila/protocol";
import { Button, Glyph, IdCard } from "@nzila/ui";
import { useEffect, useRef, useState } from "preact/hooks";
import { type SaidLine } from "../net/talking.ts";
import { arrivedOn } from "../telemovel/bi.tsx";
import { blockPlayer, playerCard, reportPlayer, type PlayerCard, type ReportReason } from "../world/account.ts";
import "./conversa.css";

const QUICK = ["goodMorning", "allGood", "letsGo"] as const;
const REASONS: readonly ReportReason[] = ["insults", "harassment", "sexual", "scam", "cheating", "name", "other"];

/** The line being typed, with the quick phrases one tap away. Enter says it; leaving it says nothing. */
export function Composer({ onSay, onTyping, onClose }: { onSay: (text: string) => void; onTyping: (on: boolean) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
    return () => onTyping(false);
    // Once, when the line opens: what the page gives is the same for as long as it is open.
  }, []);
  const say = (line: string): void => {
    if (line.trim().length > 0) onSay(line);
    setText("");
    onTyping(false);
    onClose();
  };
  return (
    <form
      class="cv-line"
      onSubmit={(event) => {
        event.preventDefault();
        say(text);
      }}
    >
      {/* A touch on a phrase must not take the line's focus first: the line would close under the finger before the touch landed. */}
      <div class="cv-quick">
        {QUICK.map((key) => (
          <button key={key} type="button" class="cv-chip" onPointerDown={(event) => event.preventDefault()} onClick={() => say(tr.t(`chat.quick.${key}`))}>
            {tr.t(`chat.quick.${key}`)}
          </button>
        ))}
      </div>
      <div class="cv-row">
        <input
          ref={field}
          class="cv-input"
          type="text"
          value={text}
          maxLength={CHAT_MAX_CHARS}
          placeholder={tr.t("chat.placeholder")}
          aria-label={tr.t("chat.placeholder")}
          autocomplete="off"
          enterkeyhint="send"
          onInput={(event) => {
            setText(event.currentTarget.value);
            onTyping(event.currentTarget.value.length > 0);
          }}
          onKeyDown={(event) => {
            // The keys that walk and jump are letters here.
            event.stopPropagation();
            if (event.key === "Escape") onClose();
          }}
          onKeyUp={(event) => event.stopPropagation()}
          onBlur={() => {
            if (text.length === 0) onClose();
          }}
        />
        <button type="submit" class="cv-send" aria-label={tr.t("chat.send")} disabled={text.trim().length === 0} onPointerDown={(event) => event.preventDefault()}>
          <Glyph name="conversa" size={22} />
        </button>
      </div>
    </form>
  );
}

/** The last few lines said near the player, oldest first; and, when a line of theirs was not said, why. */
export function ChatLog({ lines, refused, raised }: { lines: readonly SaidLine[]; refused: "words" | "slow" | "links" | null; raised?: boolean }) {
  if (lines.length === 0 && !refused) return null;
  return (
    <div class={`cv-log${raised ? " cv-log-up" : ""}`} role="log" aria-live="polite">
      {lines.map((line) => (
        <p key={`${line.at}-${line.text}`} class={line.who === null ? "cv-mine" : undefined}>
          <strong>{line.who ?? tr.t("chat.you")}</strong> {line.text}
        </p>
      ))}
      {refused ? <p class="cv-refused">{tr.t(`chat.refused.${refused}`)}</p> : null}
    </div>
  );
}

export interface Met {
  readonly entity: number;
  readonly name: string;
  readonly bi: string;
}

/**
 * Someone met in the street: their BI, and what can be done. Report, block and mute are here with "Falar", on the
 * one sheet, because a way to talk never comes without them (Rule 11).
 */
export function PlayerSheet({ met, silenced, onSilence, onShutOut, onTalk, onClose }: { met: Met; silenced: boolean; onSilence: (on: boolean) => void; onShutOut: (on: boolean) => void; onTalk: () => void; onClose: () => void }) {
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [shut, setShut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [said, setSaid] = useState<"report.sent" | "report.offline" | "player.shut" | "player.heard" | null>(null);
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
          {reporting ? (
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
