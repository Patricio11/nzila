// The browser's offer to install the game (Task 1.8), asked after the first ride. Fetched only when a browser makes
// the offer, so that the way in does not carry it (the way in is full: F-226).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { Button } from "@nzila/ui";

// The words of this came with it.
tr.extend(ptAOLater);

/** "Pôr o jogo no ecrã", or later. */
export function Oferta({ onYes, onLater }: { onYes: () => void; onLater: () => void }) {
  return (
    <div class="install" role="dialog" aria-label={tr.t("install.offer")}>
      <p>{tr.t("install.offer")}</p>
      <span class="install-keys">
        <Button onPress={onYes}>{tr.t("install.yes")}</Button>
        <Button kind="quiet" onPress={onLater}>
          {tr.t("install.later")}
        </Button>
      </span>
    </div>
  );
}
