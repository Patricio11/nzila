// /origem: a lotaria da vida (D-0.44, Task 2.3). After choosing how they
// look, a new player is dealt one card by the server and turns it over: the
// father's trade and the mother's, where the family came from, the bairro,
// and the Makuta they start with. One card, no second deal.
//
//   /origem?voltar=<address>   where to go when the card has been read
//   /origem?carta=<json>       a card given in the address (for stills; it is shown, never kept)
//   /origem?virada             opens with the card already turned

import { type Origin } from "@nzila/economy";
import { ptAO, ptAOTranslator as tr, type MessageKey } from "@nzila/i18n";
import { Button, Pano, RoadMark, Wordmark, type PanoColour } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { askAsPlayer, dealtOrigin } from "../world/account.ts";
import "./origem.css";

declare global {
  interface Window {
    /** Set when the card is on the table, for the screenshots and the tests. */
    __origem?: { ready: boolean; turned: boolean; card: Origin };
  }
}

/** A word of the catalog whose key is put together from the card. A card the catalog has no word for shows its id. */
/** The colourway of the cloth each lot in life wears. */
const CLOTH: Readonly<Record<string, PanoColour>> = { aperto: "vermelho", remediado: "azul", bem: "preto", ouro: "dourado" };

const word = (key: string, fallback: string): string => (key in ptAO ? tr.t(key as MessageKey) : fallback);

export function Origem() {
  const params = new URLSearchParams(location.search);
  const [onward, setOnward] = useState(params.get("voltar") ?? "/andar?pack=l1");
  const [card, setCard] = useState<Origin | null>(null);
  // The card says where one wakes (D-11.1): the server is asked which bairro that is, so that no other is fetched first.
  useEffect(() => void (card && askAsPlayer<{ pack: string | null }>("GET", "/v1/me/place").then(({ answer }) => answer?.pack && setOnward((was) => was.replace(/pack=[\w-]+/, `pack=${answer.pack}`)))), [card !== null]);
  const [turned, setTurned] = useState(params.has("virada"));

  useEffect(() => {
    const given = params.get("carta");
    if (given) return setCard(JSON.parse(given) as Origin);
    // With no server there is nobody to deal: the player goes on, and is dealt their card another day.
    void dealtOrigin().then((dealt) => (dealt ? setCard(dealt) : location.replace(onward)));
  }, []);
  useEffect(() => {
    if (card) window.__origem = { ready: true, turned, card };
  }, [card, turned]);

  return (
    <main class="origem n-on-dark">
      <i class="n-pano-faixa n-pano-faixa-vermelha origem-edge" aria-hidden="true" />
      <h1 class="origem-title">{tr.t("origin.title")}</h1>
      {card ? (
        <>
          <div class={`origem-card origem-${card.tier}${turned ? " origem-turned" : ""}`}>
            <button type="button" class="origem-back" aria-label={tr.t("origin.turn")} onClick={() => setTurned(true)} disabled={turned} aria-hidden={turned ? "true" : undefined}>
              <Pano scale={1.12} shiftX={-1} shiftY={-22} />
              <span class="origem-back-frame">
                <Wordmark width={112} />
              </span>
            </button>
            <article class="origem-face n-paper" aria-hidden={turned ? undefined : "true"}>
              <div class="origem-cloth">
                <Pano colour={CLOTH[card.tier] ?? "vermelho"} scale={0.56} shiftX={-1} shiftY={-8} />
              </div>
              <p class="origem-tier">{word(`origin.tier.${card.tier}`, card.tier)}</p>
              <dl class="origem-parents">
                <dt>{tr.t("origin.pai")}</dt>
                <dd>{word(`origin.trade.${card.pai}`, card.pai)}</dd>
                <dt>{tr.t("origin.mae")}</dt>
                <dd>{word(`origin.trade.${card.mae}`, card.mae)}</dd>
              </dl>
              <p class="origem-where">
                {tr.t("origin.from", { de: word(`origin.province.${card.province}.de`, card.province) })} {tr.t("origin.grew", { em: word(`origin.bairro.${card.bairro}.em`, card.bairro) })}
              </p>
              <p class="origem-line">{word(`origin.line.${card.family}`, "")}</p>
              <p class="origem-starts">{tr.t("origin.starts")}</p>
              <p class="origem-makuta">{tr.makuta(card.makuta)}</p>
              <span class="origem-stamp" aria-hidden="true">
                <RoadMark state="done" size={30} />
              </span>
              <i class="n-pano-faixa origem-foot" aria-hidden="true" />
            </article>
          </div>
          {turned ? (
            <div class="origem-after">
              <p class="origem-rule">{tr.t("origin.rule")}</p>
              <Button onPress={() => location.assign(onward)}>{tr.t("origin.go")}</Button>
            </div>
          ) : (
            <p class="origem-tap">{tr.t("origin.tap")}</p>
          )}
        </>
      ) : (
        <div class="origem-dealing" role="status">
          <div class="origem-deck" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <p>{tr.t("origin.dealing")}</p>
        </div>
      )}
    </main>
  );
}
