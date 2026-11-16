// Saving the BI, and coming back to it (UX_UI_SPEC.md §2.5; Task 2.2). Two
// ways, the player's to choose: a phone number and the six digits sent to it,
// or an email address and a password. In the BI app either ties the guest's
// account to it; at the front door either brings a saved account onto this
// phone.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { checkEmail, checkPassword } from "@nzila/protocol";
import { Button, Choice } from "@nzila/ui";
import { useState } from "preact/hooks";
import { linkEmail, linkPhone, sendCode, signInEmail, signInPhone } from "../world/account.ts";

type Said = "badphone" | "slow" | "wrong" | "none" | "offline" | "bademail" | "short" | "long" | "obvious" | "wronglogin" | "taken" | null;
type Way = "phone" | "email";

export function Guardar({ mode, onDone, onBack, first = "phone" }: { mode: "link" | "signin"; onDone: () => void; onBack: () => void; first?: Way }) {
  const [way, setWay] = useState<Way>(first);
  const [step, setStep] = useState<"phone" | "code" | "has">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
  /** The address and the password: checked here by the rule the server shares, then proposed to it. */
  const byEmail = () =>
    during(async () => {
      const address = checkEmail(email);
      if (!address) return setSaid("bademail");
      // Coming back in, any password is tried as it is; choosing one, it must be worth the name.
      const fault = mode === "link" ? checkPassword(password, address) : null;
      if (fault) return setSaid(fault);
      const answer = mode === "link" ? await linkEmail(address, password) : await signInEmail(address, password);
      if (answer === "ok") onDone();
      else setSaid(answer === "wrong" ? "wronglogin" : answer === "has" ? "taken" : answer === "invalid" ? "bademail" : answer);
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
  const typing = way === "email" ? "email" : step;
  const ready = typing === "email" ? email.includes("@") && password.length > 0 : typing === "phone" ? phone.replace(/\D/g, "").length >= 9 : /^\d{6}$/.test(code);
  const go = () => void (typing === "email" ? byEmail() : typing === "phone" ? send() : confirm());
  return (
    <form
      class="tm-save"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) go();
      }}
    >
      <h3 class="tm-data-title">{tr.t(mode === "link" ? "bi.save" : "signin.title")}</h3>
      {step === "code" ? null : (
        <Choice
          label={tr.t(mode === "link" ? "bi.save.way" : "bi.save.way.signin")}
          options={[
            { id: "phone", label: tr.t("bi.save.way.phone") },
            { id: "email", label: tr.t("bi.save.way.email") },
          ]}
          value={way}
          onChange={(next) => (setWay(next), setSaid(null))}
        />
      )}
      {typing === "email" ? (
        <>
          <label class="tm-name-label" for="tm-email">
            {tr.t("bi.save.email")}
          </label>
          <input id="tm-email" class="tm-name-input tm-save-small" type="email" inputMode="email" autocomplete="email" autocapitalize="none" spellcheck={false} value={email} maxLength={254} onInput={(event) => setEmail(event.currentTarget.value)} />
          <label class="tm-name-label" for="tm-password">
            {tr.t(mode === "link" ? "bi.save.password.new" : "bi.save.password")}
          </label>
          <input id="tm-password" class="tm-name-input tm-save-small" type="password" autocomplete={mode === "link" ? "new-password" : "current-password"} value={password} maxLength={128} onInput={(event) => setPassword(event.currentTarget.value)} />
        </>
      ) : typing === "phone" ? (
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
        {said ? tr.t(`bi.save.${said}`) : mode === "link" && step !== "code" ? tr.t(typing === "email" ? "bi.save.password.rule" : "bi.save.why") : ""}
      </p>
      <div class="tm-keys">
        <Button kind="quiet" onPress={onBack} disabled={busy}>
          {tr.t("bi.name.cancel")}
        </Button>
        <Button onPress={go} disabled={!ready} busy={busy}>
          {tr.t(typing === "email" ? (mode === "link" ? "bi.save.keep" : "bi.save.enter") : typing === "phone" ? "bi.save.send" : "bi.save.confirm")}
        </Button>
      </div>
    </form>
  );
}
