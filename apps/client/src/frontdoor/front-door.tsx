// The front door: the wordmark, one line, one button, and the size of the
// first download stated before it begins (Rule 2: megabytes are money). When
// the district is not built on this machine it says, honestly, that the game
// is still being made.
//
// Someone new is asked the year they were born on the way in (Task 2.6), then
// registers with an address and a password (D-4.12: nobody plays as a guest),
// then makes their character, then is dealt the family they were born into.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { type AgeBand } from "@nzila/protocol";
import { Button, Wordmark } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { Guardar } from "../telemovel/guardar.tsx";
import { account, comeIn, ensureGuest, wasPutOut } from "../world/account.ts";
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
  // Someone whose age is known and who has no account yet: they register (D-4.12). `?registar` shows it, for the stills.
  const [registering, setRegistering] = useState(params.has("registar"));
  // Someone whose saved BI was opened on another phone is told, once, and shown the way back in.
  const [putOut] = useState(wasPutOut);
  const [returning, setReturning] = useState(putOut || params.has("entrar"));
  // The words of coming back into an account are fetched when someone does: someone new never reads them (F-283).
  const [worded, setWorded] = useState(false);
  useEffect(() => void (returning && !worded && import("@nzila/i18n/later").then(({ ptAOLater }) => (tr.extend(ptAOLater), setWorded(true)), () => {})), [returning]);
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
    // The bairro they were last in on this phone; for someone new, the first, until their card says otherwise.
    const world = `/andar?pack=${localStorage.getItem("nzila.pack") || front.pack}`;
    location.assign(localStorage.getItem("nzila.look") ? world : `/provador?voltar=${encodeURIComponent(world)}`);
  };
  /** By the main door, or by the light one. Someone never seen here is asked their age first. */
  const enter = (poupanca: boolean): void => {
    new LocalWorld().change({ poupanca });
    // Known here and with an account: straight in. Known and with none: the account. Never seen: their age first.
    // (`?convidado` goes in as the tests do, where the server makes guests.)
    if (account()?.token || (account() && params.has("convidado"))) void go(poupanca);
    else if (account()) setRegistering(true);
    else setAsking({ poupanca });
  };
  const old = (band: AgeBand): void => {
    comeIn(band);
    if (params.has("convidado")) return void go(asking?.poupanca ?? false);
    setAsking(null);
    setRegistering(true);
  };

  return (
    <div class="frontdoor n-on-dark">
      <i class="n-pano-faixa n-pano-faixa-vermelha frontdoor-edge" aria-hidden="true" />
      <Wordmark width={asking || returning || registering ? 150 : 220} />
      {registering && !returning ? (
        <>
          <div class="frontdoor-card">
            <Postal />
          </div>
          <Guardar mode="register" onBack={() => setRegistering(false)} onDone={() => void go(new LocalWorld().settings.poupanca)} />
          <a class="frontdoor-quiet" href="/?entrar" onClick={(event) => (event.preventDefault(), setRegistering(false), setReturning(true))}>
            {tr.t("frontdoor.have")}
          </a>
        </>
      ) : returning ? (
        <>
          <div class="frontdoor-card">
            <Postal />
          </div>
          {putOut ? <p class="frontdoor-cost">{tr.t("session.elsewhere")}</p> : null}
          {worded ? <Guardar mode="signin" first={params.get("entrar") === "numero" ? "phone" : "email"} onBack={() => setReturning(false)} onDone={() => void go(new LocalWorld().settings.poupanca)} /> : null}
        </>
      ) : asking ? (
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
              {account()?.token ? null : (
                <a class="frontdoor-quiet" href="/?entrar" onClick={(event) => (event.preventDefault(), setReturning(true))}>
                  {tr.t("frontdoor.have")}
                </a>
              )}
            </div>
          ) : front === null ? (
            <p class="soft">{tr.t("frontdoor.building")}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
