// Arriving: what is on screen while the first view of a district comes down.
// A living postcard of the Marginal, whose candongueiro drives as far as the
// download has got and hoots when touched; megabytes of megabytes, counted
// by the same meter that counts everything the game downloads; and a line
// about Luanda that changes.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { useEffect, useState } from "preact/hooks";
import { dataMeter } from "../net/data-meter.ts";
import { type Front } from "./front-door.tsx";
import { Postal } from "./postal.tsx";

const FACTS = 8;

export function Arriving({ poupanca }: { poupanca: boolean }) {
  const [bytes, setBytes] = useState(dataMeter.session);
  const [total, setTotal] = useState(0);
  const [fact, setFact] = useState(() => Math.floor(Math.random() * FACTS));
  useEffect(() => dataMeter.subscribe(() => setBytes(dataMeter.session)), []);
  useEffect(() => {
    fetch("/packs/front.json")
      .then((response) => (response.ok ? (response.json() as Promise<Front>) : null))
      .then((front) => front && setTotal(poupanca ? front.firstView.poupanca : front.firstView.normal), () => undefined);
    const timer = window.setInterval(() => setFact((n) => (n + 1) % FACTS), 3800);
    return () => window.clearInterval(timer);
  }, []);
  // What was stated at the door is an estimate: the count never claims to be past the end before it is.
  const whole = Math.max(total, bytes);
  const part = whole > 0 ? Math.min(1, bytes / whole) : 0;
  return (
    <div class="arriving" role="status" aria-live="polite">
      <Postal progress={part} />
      <p class="arriving-where">{tr.t("frontdoor.loading")}</p>
      <p class="arriving-count n-num">{tr.t("frontdoor.download", { done: tr.dataSize(bytes), total: tr.dataSize(whole) })}</p>
      <p key={fact} class="arriving-fact">
        {tr.t(`frontdoor.fact.${fact}` as "frontdoor.fact.0")}
      </p>
      <p class="arriving-hint">{tr.t("frontdoor.hint")}</p>
    </div>
  );
}
