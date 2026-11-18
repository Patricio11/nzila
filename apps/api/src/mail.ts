// Mail (Task 2.2; founder, 2026-11-16: "we can use Resend for email"). The
// game sends two letters, both a six-digit code: one to prove an address is
// the player's own, one to let them choose a new password. They go through
// a `Mailer`: Resend when it has a key (RESEND_API_KEY), and otherwise the
// console of the API, so that development needs no account.
//
// The words of a letter are the catalog's, like every word a player reads.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";

// The words of this app came with it (F-195).
tr.extend(ptAOLater);

export interface Letter {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface Mailer {
  send(letter: Letter): Promise<void>;
}

/** Development: the letter is printed where the API runs, and goes nowhere. */
export const consoleMailer: Mailer = {
  send: async (letter) => console.log(`mail to ${letter.to}: ${letter.subject}\n${letter.text}`),
};

/**
 * Resend (resend.com). One request a letter; the key is never logged. `from`
 * must be an address on a domain the account has verified ("Nzila <ola@...>").
 * A letter that cannot be sent throws, and the caller decides what that means.
 */
export function resendMailer(apiKey: string, from: string, post: typeof fetch = fetch): Mailer {
  return {
    async send(letter) {
      const response = await post("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [letter.to], subject: letter.subject, text: letter.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`mail was not sent: ${response.status}`);
    },
  };
}

/** The letter that carries a code: to confirm an address, or to choose a new password. */
export function codeLetter(kind: "verify" | "reset", to: string, code: string, minutes: number): Letter {
  return { to, subject: tr.t(`mail.${kind}.subject`, { code }), text: tr.t(`mail.${kind}.text`, { code, minutes }) };
}
