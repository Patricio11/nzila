// The BI app (UX_UI_SPEC.md §2.5, §4.8; Task 2.3): the player's card, filled
// from what the server keeps of them: the name, the number, the bairro of
// the card they were dealt, the day they arrived, and the photograph taken in
// the look chooser. The name is typed here; the server says, while it is
// typed, whether it can be had.

import { ptAO, ptAOTranslator as tr, type MessageKey } from "@nzila/i18n";
import { NAME_MAX, checkName } from "@nzila/protocol";
import { Button, EmptyState, Glyph, IdCard } from "@nzila/ui";
import { useEffect, useRef, useState } from "preact/hooks";
import { type WorldProvider } from "../world/provider.ts";
import { Guardar } from "./guardar.tsx";
import { MeusDados } from "./meus-dados.tsx";
import { ptAOLater } from "@nzila/i18n/later";
import "@nzila/ui/later.css";

// The words of this app came with it (F-195).
tr.extend(ptAOLater);

const word = (key: string, fallback: string): string => (key in ptAO || key in ptAOLater ? tr.t(key as MessageKey) : fallback);

/** "15 de Novembro": the day someone arrived, as it is written in Angola (the month with its capital). */
export function arrivedOn(iso: string): string {
  const day = new Date(iso);
  if (Number.isNaN(day.getTime())) return "";
  return new Intl.DateTimeFormat("pt-AO", { day: "numeric", month: "long" }).format(day).replace(/ de (\p{L})/u, (_all, first: string) => ` de ${first.toUpperCase()}`);
}

/** What the server said of a name, or what the shared rule says before it is asked. */
type Said = "free" | "yours" | "taken" | "refused" | "short" | "long" | "letters" | "spent" | "offline" | "asking" | null;

function NameEditor({ world, onDone }: { world: WorldProvider; onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [said, setSaid] = useState<Said>(null);
  const [saving, setSaving] = useState(false);
  const latest = useRef("");

  const type = (value: string): void => {
    setTyped(value);
    latest.current = value;
    if (value.trim() === "") return setSaid(null);
    // The shared rule answers at once; the server is asked only about a name that could be one.
    const checked = checkName(value);
    if (typeof checked === "string") return setSaid(checked);
    setSaid("asking");
    window.setTimeout(() => {
      if (latest.current !== value) return;
      void world.askName(value).then((answer) => latest.current === value && setSaid(answer ?? "offline"));
    }, 350);
  };
  const save = async (): Promise<void> => {
    setSaving(true);
    const answer = await world.rename(typed);
    setSaving(false);
    if (answer === "ok") onDone();
    else setSaid(answer === "invalid" ? "letters" : answer);
  };
  const good = said === "free" || said === "yours";

  return (
    <form
      class="tm-name"
      onSubmit={(event) => {
        event.preventDefault();
        if (good) void save();
      }}
    >
      <label class="tm-name-label" for="tm-name">
        {tr.t("bi.name.label")}
      </label>
      <input id="tm-name" class="tm-name-input" type="text" value={typed} maxLength={NAME_MAX} autocomplete="off" autocapitalize="words" spellcheck={false} enterkeyhint="done" onInput={(event) => type(event.currentTarget.value)} />
      <p class={`tm-name-said${good ? " tm-name-good" : ""}`} role="status">
        {said ? tr.t(`bi.name.${said}`) : tr.t("bi.name.once")}
      </p>
      <div class="tm-keys">
        <Button kind="quiet" onPress={onDone}>
          {tr.t("bi.name.cancel")}
        </Button>
        <Button onPress={() => void save()} disabled={!good} busy={saving}>
          {tr.t("bi.name.save")}
        </Button>
      </div>
    </form>
  );
}

export function Bi({ world }: { world: WorldProvider }) {
  const [, redraw] = useState(0);
  const [naming, setNaming] = useState(false);
  const [saving, setSaving] = useState<false | "email" | "verify">(false);
  const [data, setData] = useState(new URLSearchParams(location.search).has("dados"));
  useEffect(() => {
    // The card shows what this phone knows at once, and what the server says as soon as it answers.
    void world.refreshMe().then(() => redraw((n) => n + 1));
  }, []);
  const me = world.me();
  const here = encodeURIComponent(location.pathname + location.search);
  const look = (
    <>
      <Button kind="quiet" onPress={() => location.assign(`/provador?voltar=${here}`)}>
        {tr.t("look.change")}
      </Button>
      <p class="tm-note">{tr.t("look.barbearia")}</p>
    </>
  );

  if (!me?.name) {
    return (
      <>
        <EmptyState glyph="bi" title={tr.t("state.soon")}>
          {tr.t("app.bi.soon")}
        </EmptyState>
        <p class="tm-centre">{look}</p>
      </>
    );
  }
  if (data) return <MeusDados world={world} onBack={() => setData(false)} />;
  // Saved with a number, or come into another account: either way the card is read again; a new account means a new look to wear.
  if (saving) return <Guardar mode="link" first={saving} onBack={() => setSaving(false)} onDone={() => (world.me()?.biNumber === me?.biNumber ? (setSaving(false), void world.refreshMe().then(() => redraw((n) => n + 1))) : location.reload())} />;
  return (
    <div class="tm-bi">
      <IdCard
        name={me.name}
        number={me.biNumber ?? ""}
        bairro={me.origin ? word(`origin.bairro.${me.origin.bairro}`, me.origin.bairro) : tr.t("bi.nobairro")}
        arrived={me.arrivedAt ? arrivedOn(me.arrivedAt) : ""}
        shielded
        photo={me.photo ? <img class="tm-bi-photo" src={me.photo} alt="" /> : <Glyph name="bi" size={32} />}
      />
      {naming ? (
        <NameEditor world={world} onDone={() => setNaming(false)} />
      ) : (
        <div class="tm-bi-keys">
          {me.kind === "linked" ? (
            <>
              <p class="tm-bi-saved">{tr.t("bi.saved")}</p>
              {me.savedWith?.email && !me.savedWith.emailVerified ? (
                <>
                  <Button onPress={() => setSaving("verify")}>{tr.t("bi.verify")}</Button>
                  <p class="tm-note tm-bi-why">{tr.t("bi.verify.why")}</p>
                </>
              ) : null}
            </>
          ) : (
            <>
              <Button onPress={() => setSaving("email")}>{tr.t("bi.save")}</Button>
              <p class="tm-note tm-bi-why">{tr.t("bi.save.why")}</p>
            </>
          )}
          {me.nameFree ? (
            <Button kind="quiet" onPress={() => setNaming(true)}>
              {tr.t("bi.name.change")}
            </Button>
          ) : null}
          {look}
          {me.origin ? (
            <Button kind="quiet" onPress={() => location.assign(`/origem?virada&voltar=${here}`)}>
              {tr.t("bi.family")}
            </Button>
          ) : null}
          <Button kind="quiet" onPress={() => setData(true)}>
            {tr.t("mydata.title")}
          </Button>
        </div>
      )}
    </div>
  );
}
