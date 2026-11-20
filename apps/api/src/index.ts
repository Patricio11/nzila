import { connect, liveTunables, nightlyLedgerAudit, parseKeyring, parsePepper, platformAdmins } from "@nzila/db";
import { memoryPresence, redisPresence, type Presence } from "@nzila/presence";
import { buildApp } from "./app.ts";
import { consoleMailer, resendMailer } from "./mail.ts";

const port = Number(process.env.API_PORT ?? 4000);
// Mail goes through Resend when it has a key; without one it is printed here, which is right for development and wrong for anything else.
const mailer = process.env.RESEND_API_KEY ? resendMailer(process.env.RESEND_API_KEY, process.env.EMAIL_FROM ?? "Nzila <onboarding@resend.dev>") : consoleMailer;
if (!process.env.RESEND_API_KEY) console.log("api: no RESEND_API_KEY: mail is printed here and sent nowhere");
// Redis is where the zones say they are. Without it the API still answers everything but "where do I play": nobody is sent anywhere.
let presence: Presence;
try {
  presence = await redisPresence();
} catch (error) {
  console.error(`api: no Redis (${String(error)}): no zone can be found, and players walk alone`);
  presence = memoryPresence();
}
// The game's numbers: the newest version in the database, looked for again every quarter of a minute (Task 4.6).
const tunables = await liveTunables(connect(undefined, 1), { log: (line) => console.log(line) });
const app = buildApp({ sql: connect(), pepper: parsePepper(process.env.HASH_PEPPER), keyring: parseKeyring(process.env.FIELD_KEYS), mailer, phoneCodes: process.env.PHONE_CODES === "on", presence, tunables });
// The books are proved once a day (the ledger convention): asked every hour, done when due, and said loudly when wrong.
const sql = connect(undefined, 1);
const prove = (): void =>
  void nightlyLedgerAudit(sql).then(
    async (said) => {
      if (!said) return;
      if (said.ok) return console.log(`api: ledger audit: the books balance (${said.transfers} transfers)`);
      const alarm = `THE BOOKS DO NOT BALANCE: all accounts add up to ${said.sum}; ${said.wrong.length} balance(s) do not match their rows; ${said.overdrawn.length} account(s) below zero`;
      console.error(`api: ALARM: ${alarm}`);
      // And by mail to whoever runs the platform: the alarm must reach someone who is not looking.
      for (const to of await platformAdmins(sql)) await mailer.send({ to, subject: "Nzila: as contas do jogo não batem certo", text: `${alarm}.\n\nO registo do Estúdio tem os pormenores. Ninguém deve mexer em dinheiro até se saber porquê.` }).catch(() => undefined);
    },
    (error: unknown) => console.error(`api: the ledger could not be audited: ${String(error)}`),
  );
prove();
setInterval(prove, 3_600_000).unref();
await app.listen({ port, host: "0.0.0.0" });
console.log(`api: listening on ${port}`);
