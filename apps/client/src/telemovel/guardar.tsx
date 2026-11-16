// Saving the BI, and coming back to it (UX_UI_SPEC.md §2.5; Task 2.2). An
// email address and a password: in the BI app they tie the guest's account
// to the address, and a code sent to it proves the address is the player's
// own; at the front door they bring a saved account onto this phone, and
// "Esqueci-me" chooses a new password with a code sent to the address.
//
// A phone number and a code sent to it is the other way, built and switched
// off: nobody is paying a provider to send the codes (founder, 2026-11-16).
// It is offered only where it has been switched on (`phoneOffered`).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { checkEmail, checkPassword } from "@nzila/protocol";
import { Button, Choice } from "@nzila/ui";
import { useState } from "preact/hooks";
import { forgotPassword, linkEmail, linkPhone, mailVerifyCode, phoneOffered, resetPassword, sendCode, signInEmail, signInPhone, verifyEmail } from "../world/account.ts";

type Said = "badphone" | "slow" | "wrong" | "none" | "offline" | "bademail" | "short" | "long" | "obvious" | "wronglogin" | "taken" | "mailed" | "verified" | null;
type Way = "phone" | "email";
/** One step's work: what pressing its button does. */
interface Act {
  (): PromiseLike<void>;
}
/** Where the player is in it: giving a number, typing its code, told the number has an account; giving an address and a password, proving the address, asking for a new password, choosing it. */
type Step = "phone" | "code" | "has" | "email" | "verify" | "forgot" | "reset";

export function Guardar({ mode, onDone, onBack, first = "email" }: { mode: "link" | "signin"; onDone: () => void; onBack: () => void; first?: Way | "verify" }) {
  const offered = phoneOffered();
  const [step, setStep] = useState<Step>(first === "verify" ? "verify" : first === "phone" && offered ? "phone" : "email");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [said, setSaid] = useState<Said>(first === "verify" ? "mailed" : null);
  const [busy, setBusy] = useState(false);

  /** One thing asked of the server at a time, and the button says so while it is. */
  const during = async (work: { (): PromiseLike<unknown> }) => {
    setBusy(true);
    setSaid(null);
    await work();
    setBusy(false);
  };
  const to = (next: Step, say: Said = null): void => {
    setCode("");
    setStep(next);
    setSaid(say);
  };
  const acts: Record<Exclude<Step, "has">, Act> = {
    phone: () =>
      during(async () => {
        const answer = await sendCode(phone);
        if (answer === "ok") to("code");
        else setSaid(answer === "invalid" ? "badphone" : answer);
      }),
    code: () =>
      during(async () => {
        const answer = mode === "signin" ? await signInPhone(phone, code) : await linkPhone(phone, code);
        if (answer === "ok") onDone();
        else if (answer === "has") setStep("has");
        else setSaid(answer);
      }),
    // The address and the password: checked here by the rule the server shares, then proposed to it.
    email: () =>
      during(async () => {
        const address = checkEmail(email);
        if (!address) return setSaid("bademail");
        // Coming back in, any password is tried as it is; choosing one, it must be worth the name.
        const fault = mode === "link" ? checkPassword(password, address) : null;
        if (fault) return setSaid(fault);
        const answer = mode === "link" ? await linkEmail(address, password) : await signInEmail(address, password);
        // Saved: a letter has gone to the address with the code that proves it.
        if (answer === "ok") return mode === "link" ? to("verify", "mailed") : onDone();
        setSaid(answer === "wrong" ? "wronglogin" : answer === "has" ? "taken" : answer === "invalid" ? "bademail" : answer);
      }),
    verify: () =>
      during(async () => {
        const answer = await verifyEmail(code);
        if (answer === "ok") onDone();
        else setSaid(answer);
      }),
    forgot: () =>
      during(async () => {
        if (!checkEmail(email)) return setSaid("bademail");
        const answer = await forgotPassword(email);
        if (answer === "ok") {
          setPassword("");
          to("reset", "mailed");
        } else setSaid(answer);
      }),
    reset: () =>
      during(async () => {
        const fault = checkPassword(password, checkEmail(email) ?? "");
        if (fault) return setSaid(fault);
        const answer = await resetPassword(email, code, password);
        if (answer === "ok") onDone();
        else setSaid(answer);
      }),
  };

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
          <Button kind="quiet" onPress={() => void during(async () => ((await signInPhone(phone, code)) === "ok" ? onDone() : setSaid("offline")))} busy={busy}>
            {tr.t("bi.save.switch")}
          </Button>
        </div>
      </div>
    );
  }
  const sixDigits = /^\d{6}$/.test(code);
  const ready = { phone: phone.replace(/\D/g, "").length >= 9, code: sixDigits, email: email.includes("@") && password.length > 0, verify: sixDigits, forgot: email.includes("@"), reset: sixDigits && password.length > 0 }[step];
  const go = () => void acts[step]();
  const title = step === "verify" ? "bi.verify" : step === "forgot" || step === "reset" ? "bi.forgot" : mode === "link" ? "bi.save" : "signin.title";
  const press = { phone: "bi.save.send", code: "bi.save.confirm", email: mode === "link" ? "bi.save.keep" : "bi.save.enter", verify: "bi.verify.confirm", forgot: "bi.save.send", reset: "bi.forgot.keep" }[step] as "bi.save.send";
  const hint = step === "email" && mode === "link" ? "bi.save.password.rule" : step === "phone" && mode === "link" ? "bi.save.why" : step === "reset" ? "bi.save.password.rule" : null;
  const codeField = (
    <>
      <label class="tm-name-label" for="tm-code">
        {tr.t("bi.save.code")}
      </label>
      <input id="tm-code" class="tm-name-input tm-save-code" type="text" inputMode="numeric" autocomplete="one-time-code" value={code} maxLength={6} onInput={(event) => setCode(event.currentTarget.value.replace(/\D/g, ""))} />
    </>
  );
  const emailField = (
    <>
      <label class="tm-name-label" for="tm-email">
        {tr.t("bi.save.email")}
      </label>
      <input id="tm-email" class="tm-name-input tm-save-small" type="email" inputMode="email" autocomplete="email" autocapitalize="none" spellcheck={false} value={email} maxLength={254} onInput={(event) => setEmail(event.currentTarget.value)} />
    </>
  );
  const passwordField = (fresh: boolean) => (
    <>
      <label class="tm-name-label" for="tm-password">
        {tr.t(fresh ? "bi.save.password.new" : "bi.save.password")}
      </label>
      <input id="tm-password" class="tm-name-input tm-save-small" type="password" autocomplete={fresh ? "new-password" : "current-password"} value={password} maxLength={128} onInput={(event) => setPassword(event.currentTarget.value)} />
    </>
  );
  return (
    <form
      class="tm-save"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) go();
      }}
    >
      <h3 class="tm-data-title">{tr.t(title)}</h3>
      {offered && (step === "phone" || step === "email") ? (
        <Choice
          label={tr.t(mode === "link" ? "bi.save.way" : "bi.save.way.signin")}
          options={[
            { id: "email", label: tr.t("bi.save.way.email") },
            { id: "phone", label: tr.t("bi.save.way.phone") },
          ]}
          value={step}
          onChange={(next) => to(next)}
        />
      ) : null}
      {step === "phone" ? (
        <>
          <label class="tm-name-label" for="tm-phone">
            {tr.t("bi.save.phone")}
          </label>
          <input id="tm-phone" class="tm-name-input" type="tel" inputMode="tel" autocomplete="tel" value={phone} maxLength={20} onInput={(event) => setPhone(event.currentTarget.value)} />
        </>
      ) : step === "code" ? (
        codeField
      ) : step === "email" ? (
        <>
          {emailField}
          {passwordField(mode === "link")}
        </>
      ) : step === "verify" ? (
        codeField
      ) : step === "forgot" ? (
        emailField
      ) : (
        <>
          {codeField}
          {passwordField(true)}
        </>
      )}
      <p class="tm-save-said" role="status">
        {said ? tr.t(`bi.save.${said}`) : hint ? tr.t(hint) : ""}
      </p>
      <div class="tm-keys">
        <Button kind="quiet" onPress={step === "verify" ? onDone : step === "forgot" || step === "reset" ? () => to("email") : onBack} disabled={busy}>
          {tr.t(step === "verify" ? "bi.verify.later" : "bi.name.cancel")}
        </Button>
        <Button onPress={go} disabled={!ready} busy={busy}>
          {tr.t(press)}
        </Button>
      </div>
      {step === "email" && mode === "signin" ? (
        <button type="button" class="tm-data-end" onClick={() => to("forgot")}>
          {tr.t("bi.forgot.ask")}
        </button>
      ) : step === "verify" ? (
        <button type="button" class="tm-data-end" disabled={busy} onClick={() => void during(async () => setSaid((await mailVerifyCode()) === "ok" ? "mailed" : "slow"))}>
          {tr.t("bi.verify.again")}
        </button>
      ) : null}
    </form>
  );
}
