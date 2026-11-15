// Arriving: what is on screen while the first view of a district comes down.
// Megabytes and progress, counted by the same meter that counts everything
// the game downloads; a van on its road for the eye; a line about Luanda.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Van } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { dataMeter } from "../net/data-meter.ts";
import { type Front } from "./front-door.tsx";

const FACTS = 4;

export function Arriving({ poupanca }: { poupanca: boolean }) {
  const [bytes, setBytes] = useState(dataMeter.session);
  const [total, setTotal] = useState(0);
  const [fact, setFact] = useState(0);
  useEffect(() => dataMeter.subscribe(() => setBytes(dataMeter.session)), []);
  useEffect(() => {
    fetch("/packs/front.json")
      .then((response) => (response.ok ? (response.json() as Promise<Front>) : null))
      .then((front) => front && setTotal(poupanca ? front.firstView.poupanca : front.firstView.normal), () => undefined);
    const timer = window.setInterval(() => setFact((n) => (n + 1) % FACTS), 4200);
    return () => window.clearInterval(timer);
  }, []);
  // What was stated at the door is an estimate: the count never claims to be past the end before it is.
  const whole = Math.max(total, bytes);
  const part = whole > 0 ? Math.min(1, bytes / whole) : 0;
  return (
    <div class="arriving" role="status" aria-live="polite">
      <p>{tr.t("frontdoor.loading")}</p>
      <div class="arriving-road" aria-hidden="true">
        <span class="arriving-van" style={{ left: `${8 + part * 84}%` }}>
          <Van />
        </span>
      </div>
      <p class="arriving-count n-num">{tr.t("frontdoor.download", { done: tr.dataSize(bytes), total: tr.dataSize(whole) })}</p>
      <p class="arriving-fact">{tr.t(`frontdoor.fact.${fact}` as "frontdoor.fact.0")}</p>
    </div>
  );
}
