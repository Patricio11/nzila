// Saving the BI, and coming back to it (UX_UI_SPEC.md §2.5; Task 2.2). A
// phone number, then the six digits sent to it. In the BI app this ties the
// guest's account to the number; at the front door it brings a saved account
// onto this phone. The same two steps either way.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Button } from "@nzila/ui";
import { useState } from "preact/hooks";
import { linkPhone, sendCode, signInPhone } from "../world/account.ts";

type Said = "badphone" | "slow" | "wrong" | "none" | "offline" | null;

export function Guardar({ mode, onDone, onBack }: { mode: "link" | "signin"; onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState<"phone" | "code" | "has">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [said, setSaid] = useState<Said>(null);
  const [busy, setBusy] = useState(false);

  /** One thing asked of the server at a time, and the button says so while it is. */
  const during = async (work: { (): PromiseLike<unknown> }) => {
    setBusy(true);
    setSaid(null);
    await work();
    setBusy(false);
  };
  const send = () =>
    during(async () => {
      const answer = await sendCode(phone);
      if (answer === "ok") setStep("code");
      else setSaid(answer === "invalid" ? "badphone" : answer);
    });
  const enter = () =>
    during(async () => {
      const answer = await signInPhone(phone, code);
      if (answer === "ok") onDone();
      else setSaid(answer);
    });
  const confirm = () =>
    mode === "signin"
      ? enter()
      : during(async () => {
          const answer = await linkPhone(phone, code);
          if (answer === "ok") onDone();
          else if (answer === "has") setStep("has");
          else setSaid(answer);
        });

  if (step === "has") {
    return (
      <div class="tm-save" role="alertdialog" aria-label={tr.t("bi.save")}>
        <p class="tm-note">{tr.t("bi.save.has")}</p>
        <p class="tm-save-said" role="status">
          {said ? tr.t(`bi.save.${said}`) : ""}
        </p>
        <div class="tm-keys">
          <Button onPress={onBack} disabled={busy}>
            {tr.t("mydata.delete.no")}
          </Button>
          <Button kind="quiet" onPress={() => void enter()} busy={busy}>
            {tr.t("bi.save.switch")}
          </Button>
        </div>
      </div>
    );
  }
  const ready = step === "phone" ? phone.replace(/\D/g, "").length >= 9 : /^\d{6}$/.test(code);
  return (
    <form
      class="tm-save"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) void (step === "phone" ? send() : confirm());
      }}
    >
      <h3 class="tm-data-title">{tr.t(mode === "link" ? "bi.save" : "signin.title")}</h3>
      {step === "phone" ? (
        <>
          <label class="tm-name-label" for="tm-phone">
            {tr.t("bi.save.phone")}
          </label>
          <input id="tm-phone" class="tm-name-input" type="tel" inputMode="tel" autocomplete="tel" value={phone} maxLength={20} onInput={(event) => setPhone(event.currentTarget.value)} />
        </>
      ) : (
        <>
          <label class="tm-name-label" for="tm-code">
            {tr.t("bi.save.code")}
          </label>
          <input id="tm-code" class="tm-name-input tm-save-code" type="text" inputMode="numeric" autocomplete="one-time-code" value={code} maxLength={6} onInput={(event) => setCode(event.currentTarget.value.replace(/\D/g, ""))} />
        </>
      )}
      <p class="tm-save-said" role="status">
        {said ? tr.t(`bi.save.${said}`) : step === "phone" && mode === "link" ? tr.t("bi.save.why") : ""}
      </p>
      <div class="tm-keys">
        <Button kind="quiet" onPress={onBack} disabled={busy}>
          {tr.t("bi.name.cancel")}
        </Button>
        <Button onPress={() => void (step === "phone" ? send() : confirm())} disabled={!ready} busy={busy}>
          {tr.t(step === "phone" ? "bi.save.send" : "bi.save.confirm")}
        </Button>
      </div>
    </form>
  );
}
