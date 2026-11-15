// The front door: the wordmark, one line, one button, and the size of the
// first download stated before it begins (Rule 2: megabytes are money). When
// the district is not built on this machine it says, honestly, that the game
// is still being made.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Button, Wordmark } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { LocalWorld } from "../world/provider.ts";
import { Postal } from "./postal.tsx";

/** What tools/pack writes for this page: the first district, and what its first view costs at each tier. */
export interface Front {
  readonly pack: string;
  readonly nameKey: string;
  readonly firstView: { readonly normal: number; readonly poupanca: number };
}

export function FrontDoor() {
  const [front, setFront] = useState<Front | null | undefined>(undefined);
  useEffect(() => {
    fetch("/packs/front.json")
      .then((response) => (response.ok ? (response.json() as Promise<Front>) : null))
      .then(setFront, () => setFront(null));
  }, []);

  /** In by the main door, or by the light one: the choice is kept on the device, and the game opens. */
  const enter = (poupanca: boolean): void => {
    if (!front) return;
    new LocalWorld().change({ poupanca });
    // Someone new chooses how they look before they arrive; someone who has, goes straight in.
    const world = `/andar?pack=${front.pack}`;
    location.assign(localStorage.getItem("nzila.look") ? world : `/provador?voltar=${encodeURIComponent(world)}`);
  };

  return (
    <div class="frontdoor n-on-dark">
      <Wordmark width={220} />
      <p>{tr.t("frontdoor.tagline")}</p>
      <div class="frontdoor-card">
        <Postal />
      </div>
      {front ? (
        <div class="frontdoor-enter">
          <Button onPress={() => enter(false)}>{tr.t("frontdoor.enter")}</Button>
          <p class="frontdoor-cost">{tr.t("frontdoor.cost", { size: tr.dataSize(front.firstView.normal) })}</p>
          <a class="frontdoor-quiet" href={`/andar?pack=${front.pack}`} onClick={(event) => (event.preventDefault(), enter(true))}>
            {tr.t("frontdoor.poupanca", { size: tr.dataSize(front.firstView.poupanca) })}
          </a>
        </div>
      ) : front === null ? (
        <p class="soft">{tr.t("frontdoor.building")}</p>
      ) : null}
    </div>
  );
}
