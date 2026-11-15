// The front door: the wordmark, one line, one button, and the size of the
// first download stated before it begins (Rule 2: megabytes are money). When
// the district is not built on this machine it says, honestly, that the game
// is still being made.
//
// Someone new is asked the year they were born on the way in (Task 2.6), and
// the server is asked for their guest (Task 2.1) before the game opens.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { type AgeBand } from "@nzila/protocol";
import { Button, Wordmark } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { account, comeIn, ensureGuest } from "../world/account.ts";
import { LocalWorld } from "../world/provider.ts";
import { AgeGate, turnedAway } from "./age.tsx";
import { Postal } from "./postal.tsx";

/** What tools/pack writes for this page: the first district, and what its first view costs at each tier. */
export interface Front {
  readonly pack: string;
  readonly nameKey: string;
  readonly firstView: { readonly normal: number; readonly poupanca: number };
}

export function FrontDoor() {
  const [front, setFront] = useState<Front | null | undefined>(undefined);
  // The door someone new knocked at, while they are asked their age: the main one, or the light one.
  // (`?ano=1990` and `?cedo` open it as it is asked and as it refuses, for the stills.)
  const params = new URLSearchParams(location.search);
  const [asking, setAsking] = useState<{ poupanca: boolean } | null>(() => (turnedAway() || params.has("ano") || params.has("cedo") ? { poupanca: false } : null));
  const [going, setGoing] = useState(false);
  useEffect(() => {
    fetch("/packs/front.json")
      .then((response) => (response.ok ? (response.json() as Promise<Front>) : null))
      .then(setFront, () => setFront(null));
  }, []);

  /** In: the choice of door is kept on the device, the server is told who has come, and the game opens. */
  const go = async (poupanca: boolean): Promise<void> => {
    if (!front) return;
    setGoing(true);
    new LocalWorld().change({ poupanca });
    // With no server to answer, the game opens all the same, and asks again next time.
    await ensureGuest();
    // Someone new chooses how they look before they arrive; someone who has, goes straight in.
    const world = `/andar?pack=${front.pack}`;
    location.assign(localStorage.getItem("nzila.look") ? world : `/provador?voltar=${encodeURIComponent(world)}`);
  };
  /** By the main door, or by the light one. Someone never seen here is asked their age first. */
  const enter = (poupanca: boolean): void => {
    if (account()) void go(poupanca);
    else setAsking({ poupanca });
  };
  const old = (band: AgeBand): void => {
    comeIn(band);
    void go(asking?.poupanca ?? false);
  };

  return (
    <div class="frontdoor n-on-dark">
      <Wordmark width={asking ? 150 : 220} />
      {asking ? (
        <AgeGate onIn={old} start={params.get("ano") ?? ""} shut={params.has("cedo")} busy={going} />
      ) : (
        <>
          <p>{tr.t("frontdoor.tagline")}</p>
          <div class="frontdoor-card">
            <Postal />
          </div>
          {front ? (
            <div class="frontdoor-enter">
              <Button onPress={() => enter(false)} busy={going}>
                {tr.t("frontdoor.enter")}
              </Button>
              <p class="frontdoor-cost">{tr.t("frontdoor.cost", { size: tr.dataSize(front.firstView.normal) })}</p>
              <a class="frontdoor-quiet" href={`/andar?pack=${front.pack}`} onClick={(event) => (event.preventDefault(), enter(true))}>
                {tr.t("frontdoor.poupanca", { size: tr.dataSize(front.firstView.poupanca) })}
              </a>
            </div>
          ) : front === null ? (
            <p class="soft">{tr.t("frontdoor.building")}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
