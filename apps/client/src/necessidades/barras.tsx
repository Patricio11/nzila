// Fome and Energia on the screen (Task 4.4, UX_UI_SPEC.md §2 `<NeedsBars>` and "When Fome or Energia falls"). The
// zone keeps them and says them (EVENT.NECESSIDADES); this draws them. It is fetched by the street only once a need
// first falls under half, so that a player who eats in time never downloads it (the way in is full: F-226).
//
// Two thin bars under the wallet chip, hidden while both are above half. A line, said once each time it becomes
// true: too tired to go fast or to jump, and hungry under a fifth.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { NeedsBars } from "@nzila/ui";
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

/** The bars, and the line when there is one: what the session last heard, read twice a second. */
export function Necessidades({ net }: { net: { readonly current: { readonly needs: NeedsSaid } | null } }) {
  const read = (): NeedsSaid => net.current?.needs ?? null;
  const [now, setNow] = useState<NeedsSaid>(read());
  const [line, setLine] = useState<string | null>(null);
  const was = useRef({ tired: false, hungry: false });
  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    const say = (text: string): void => {
      setLine(text);
      clearTimeout(hide);
      hide = setTimeout(() => setLine(null), LINE_MS);
    };
    const look = (): void => {
      const needs = read();
      setNow(needs);
      if (!needs) return;
      const hungry = needs.fome < HUNGRY_BELOW;
      // Each said once as it becomes true: not again until it has stopped being so.
      if (needs.tired && !was.current.tired) say(tr.t("needs.cansado"));
      else if (hungry && !was.current.hungry) say(tr.t("needs.fome"));
      was.current = { tired: needs.tired, hungry };
    };
    look();
    const every = setInterval(look, 500);
    return () => {
      clearInterval(every);
      clearTimeout(hide);
    };
  }, [net]);
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
