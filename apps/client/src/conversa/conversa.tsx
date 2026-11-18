// Talk, as the player has it in their hand (Task 3.5, Rule 11): the line
// they type with the quick phrases over it, the last lines to read back, and
// the card of someone they met, with everything that can be done about them
// on the same sheet: talk, stop hearing, shut out, report.
//
// Nothing here knows about the zone. The page gives it what was said and is
// told what the player does.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { CHAT_MAX_CHARS } from "@nzila/protocol";
import { Glyph } from "@nzila/ui";
import { useEffect, useRef, useState } from "preact/hooks";
import { type SaidLine } from "../net/talking.ts";
import "./conversa.css";

const QUICK = ["goodMorning", "allGood", "letsGo"] as const;

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
export function ChatLog({ lines, refused, raised }: { lines: readonly SaidLine[]; refused: "words" | "slow" | "links" | "muted" | null; raised?: boolean }) {
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
