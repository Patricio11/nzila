// "Os meus dados" (UX_UI_SPEC.md §4.8; Task 2.6; Rule 16), inside the BI
// app: what the game keeps of the player, said plainly; the two things they
// may say yes or no to, both off until they say yes; all of it as a file to
// take away; and the end of the account, asked twice.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { checkPassword } from "@nzila/protocol";
import { Button, Toggle } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { changePassword } from "../world/account.ts";
import { type WorldProvider } from "../world/provider.ts";

// Its words come with it, and with the BI that opens it (F-202).
tr.extend(ptAOLater);

/** A new password, for someone who knows the one they have. */
function NovaPalavraPasse({ onDone }: { onDone: (changed: boolean) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [said, setSaid] = useState<"wronglogin" | "short" | "long" | "obvious" | "slow" | "offline" | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (): Promise<void> => {
    const fault = checkPassword(next);
    if (fault) return setSaid(fault);
    setBusy(true);
    const answer = await changePassword(current, next);
    setBusy(false);
    if (answer === "ok") onDone(true);
    else setSaid(answer === "wrong" ? "wronglogin" : answer === "invalid" ? "obvious" : answer);
  };
  return (
    <form
      class="tm-save"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h3 class="tm-data-title">{tr.t("mydata.password")}</h3>
      <label class="tm-name-label" for="tm-current">
        {tr.t("mydata.password.current")}
      </label>
      <input id="tm-current" class="tm-name-input tm-save-small" type="password" autocomplete="current-password" value={current} maxLength={128} onInput={(event) => setCurrent(event.currentTarget.value)} />
      <label class="tm-name-label" for="tm-next">
        {tr.t("bi.save.password.new")}
      </label>
      <input id="tm-next" class="tm-name-input tm-save-small" type="password" autocomplete="new-password" value={next} maxLength={128} onInput={(event) => setNext(event.currentTarget.value)} />
      <p class="tm-save-said" role="status">
        {said ? tr.t(`bi.save.${said}`) : tr.t("bi.save.password.rule")}
      </p>
      <div class="tm-keys">
        <Button kind="quiet" onPress={() => onDone(false)} disabled={busy}>
          {tr.t("bi.name.cancel")}
        </Button>
        <Button onPress={() => void save()} disabled={current.length === 0 || next.length === 0} busy={busy}>
          {tr.t("bi.save.keep")}
        </Button>
      </div>
    </form>
  );
}

export function MeusDados({ world, onBack }: { world: WorldProvider; onBack: () => void }) {
  const [choices, setChoices] = useState<{ analytics: boolean; notifications: boolean } | null>(null);
  const [said, setSaid] = useState<"offline" | "exported" | "changed" | null>(null);
  const [password, setPassword] = useState(false);
  const [deleting, setDeleting] = useState<"no" | "asking" | "busy">("no");

  useEffect(() => {
    void world.choices().then((now) => (now ? setChoices(now) : setSaid("offline")));
  }, []);
  const choose = async (purpose: "analytics" | "notifications", granted: boolean): Promise<void> => {
    const now = await world.choose(purpose, granted);
    if (now) setChoices(now);
    setSaid(now ? null : "offline");
  };
  const take = async (): Promise<void> => {
    const data = await world.exportData();
    if (!data) return setSaid("offline");
    // A file the phone saves, as any download: nothing of it is kept in the page.
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    link.download = "nzila-os-meus-dados.json";
    link.click();
    URL.revokeObjectURL(link.href);
    setSaid("exported");
  };
  const erase = async (): Promise<void> => {
    setDeleting("busy");
    // Gone from the server, then from this phone; the door is where someone with no account stands.
    if (await world.deleteAccount()) location.assign("/");
    else {
      setDeleting("no");
      setSaid("offline");
    }
  };

  if (password) return <NovaPalavraPasse onDone={(changed) => (setPassword(false), setSaid(changed ? "changed" : null))} />;
  if (deleting !== "no") {
    return (
      <div class="tm-data tm-data-delete" role="alertdialog" aria-label={tr.t("mydata.delete.title")}>
        <h3 class="tm-data-title">{tr.t("mydata.delete.title")}</h3>
        <p class="tm-note">{tr.t("mydata.delete.body")}</p>
        <div class="tm-keys">
          <Button onPress={() => setDeleting("no")} disabled={deleting === "busy"}>
            {tr.t("mydata.delete.no")}
          </Button>
          <Button kind="quiet" onPress={() => void erase()} busy={deleting === "busy"}>
            {tr.t("mydata.delete.yes")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div class="tm-data">
      <h3 class="tm-data-title">{tr.t("mydata.title")}</h3>
      <p class="tm-note">{tr.t("mydata.intro")}</p>
      {choices ? (
        <>
          <Toggle label={tr.t("mydata.analytics")} on={choices.analytics} onChange={(on) => void choose("analytics", on)} />
          <p class="tm-note">{tr.t("mydata.analytics.note")}</p>
          <Toggle label={tr.t("mydata.notifications")} on={choices.notifications} onChange={(on) => void choose("notifications", on)} />
          <p class="tm-note">{tr.t("mydata.notifications.note")}</p>
        </>
      ) : null}
      <p class="tm-data-said" role="status">
        {said === "offline" ? tr.t("bi.name.offline") : said === "exported" ? tr.t("mydata.export.done") : said === "changed" ? tr.t("mydata.password.done") : ""}
      </p>
      <div class="tm-bi-keys">
        <Button onPress={() => void take()}>{tr.t("mydata.export")}</Button>
        {world.me()?.savedWith?.email ? (
          <Button kind="quiet" onPress={() => setPassword(true)}>
            {tr.t("mydata.password")}
          </Button>
        ) : null}
        <Button kind="quiet" onPress={onBack}>
          {tr.t("mydata.back")}
        </Button>
        <button type="button" class="tm-data-end" onClick={() => setDeleting("asking")}>
          {tr.t("mydata.delete")}
        </button>
      </div>
    </div>
  );
}
