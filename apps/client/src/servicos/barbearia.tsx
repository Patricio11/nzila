// The barbearia, on this phone (D-11.10): hair and its colour are changed at a barbearia and nowhere else. The
// sheet says what a cut costs before anything is paid; paid through the API on the zone's word that the player
// stands there; then the mirror opens with the hair alone to choose (/provador?corte), and the player comes back
// to the street. Opened as a biscato's sheet is, from the gold button at the place. Fetched when it is first used.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { Button } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { askAsPlayer } from "../world/account.ts";
import "../andar/entre-bairros.css";

// The words of this came with it.
tr.extend(ptAOLater);

/** A key for one cut: asked twice, it is paid once. */
const newKey = (): string => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export function Biscato({ place, onClose }: { net: unknown; place: string; onClose: () => void }) {
  const [price, setPrice] = useState<number | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newKey);
  useEffect(() => {
    let alive = true;
    void askAsPlayer<{ price: number }>("GET", "/v1/servicos/corte").then(({ answer }) => alive && (answer ? setPrice(answer.price) : setSaid(tr.t("barbearia.longe"))));
    return () => void (alive = false);
  }, []);
  const sit = async (): Promise<void> => {
    setBusy(true);
    setSaid(null);
    const { answer, error } = await askAsPlayer<{ price: number }>("POST", "/v1/servicos/corte", { key });
    if (!answer) {
      setBusy(false);
      return setSaid(tr.t(error === "insufficient" ? "barbearia.falta" : error === "not_there" ? "barbearia.longe" : "barbearia.falhou"));
    }
    location.assign(`/provador?corte&voltar=${encodeURIComponent(location.pathname + location.search)}`);
  };
  return (
    <div class="eb-back" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section class="eb-sheet n-on-dark" role="dialog" aria-label={place}>
        <span class="n-pano-faixa n-pano-faixa-vermelha" aria-hidden="true" />
        <div class="eb-in">
          <h3>{place}</h3>
          {price !== null ? <p class="eb-preco">{tr.t("barbearia.preco", { preco: tr.makuta(price) })}</p> : null}
          <p class="eb-dados">{tr.t("barbearia.como")}</p>
          {said ? (
            <p class="eb-said" role="status">
              {said}
            </p>
          ) : null}
          <div class="eb-keys">
            <Button kind="quiet" onPress={onClose}>
              {tr.t("barbearia.depois")}
            </Button>
            <Button disabled={price === null} busy={busy} onPress={() => void sit()}>
              {tr.t("barbearia.sentar")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
