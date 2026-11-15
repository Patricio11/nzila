// The age question (Task 2.6): asked once, on the way in, before anything
// else. A year is typed on keys of the game's own, as on a telephone; it
// stays on this phone, and only the band it falls in is kept. Whoever is
// under 15 is turned away kindly, and nothing of them is kept at all.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { type AgeBand } from "@nzila/protocol";
import { Button, Glyph } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { ageOf } from "../world/account.ts";
import { Postal } from "./postal.tsx";

const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const TOO_YOUNG = "nzila.cedo";

/** Whether someone was turned away on this visit: the door stays shut until the page is opened afresh. */
export function turnedAway(): boolean {
  try {
    return sessionStorage.getItem(TOO_YOUNG) !== null;
  } catch {
    return false;
  }
}

export function AgeGate({ onIn, start = "", shut = false, busy = false }: { onIn: (band: AgeBand) => void; start?: string; shut?: boolean; busy?: boolean }) {
  const [typed, setTyped] = useState(start);
  const [state, setState] = useState<"asking" | "wrong" | "young">(shut || turnedAway() ? "young" : "asking");

  const press = (digit: number): void => {
    setState("asking");
    setTyped((now) => (now.length < 4 ? now + String(digit) : now));
  };
  const erase = (): void => {
    setState("asking");
    setTyped((now) => now.slice(0, -1));
  };
  const confirm = (): void => {
    if (typed.length < 4) return;
    const band = ageOf(Number(typed));
    if (band === "invalid") return setState("wrong");
    if (band === "young") {
      try {
        sessionStorage.setItem(TOO_YOUNG, "1");
      } catch {
        // Storage is off: they are asked again, and answered the same.
      }
      return setState("young");
    }
    onIn(band);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (/^\d$/.test(event.key)) press(Number(event.key));
      else if (event.key === "Backspace") erase();
      else if (event.key === "Enter") confirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (state === "young") {
    return (
      <section class="age age-young" role="status">
        <h2 class="age-title">{tr.t("age.young.title")}</h2>
        <p class="age-note">{tr.t("age.young.body")}</p>
        <div class="frontdoor-card">
          <Postal />
        </div>
      </section>
    );
  }
  return (
    <section class={`age${state === "wrong" ? " age-wrong" : ""}`}>
      <h2 class="age-title">{tr.t("age.title")}</h2>
      <p class="age-note">{tr.t("age.note")}</p>
      <div class="age-year n-paper" role="group" aria-label={tr.t("age.year")}>
        {[0, 1, 2, 3].map((n) => (
          <span key={`${n}${typed[n] ?? ""}`} class={`age-digit${typed[n] ? " age-digit-set" : ""}`} data-next={n === typed.length ? "" : undefined}>
            {typed[n] ?? ""}
          </span>
        ))}
      </div>
      <p class="age-said" role="alert">
        {state === "wrong" ? tr.t("age.invalid") : ""}
      </p>
      <div class="age-keys">
        {KEYS.map((digit) => (
          <button type="button" class="age-key" onClick={() => press(digit)}>
            {String(digit)}
          </button>
        ))}
        <button type="button" class="age-key age-key-quiet" aria-label={tr.t("age.erase")} onClick={erase} disabled={typed.length === 0}>
          <Glyph name="voltar" size={22} />
        </button>
        <button type="button" class="age-key" onClick={() => press(0)}>
          {String(0)}
        </button>
        <span />
      </div>
      <Button onPress={confirm} disabled={typed.length < 4} busy={busy}>
        {tr.t("age.ok")}
      </Button>
    </section>
  );
}
