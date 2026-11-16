import { connect, parseKeyring, parsePepper } from "@nzila/db";
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
const app = buildApp({ sql: connect(), pepper: parsePepper(process.env.HASH_PEPPER), keyring: parseKeyring(process.env.FIELD_KEYS), mailer, phoneCodes: process.env.PHONE_CODES === "on", presence });
await app.listen({ port, host: "0.0.0.0" });
console.log(`api: listening on ${port}`);
