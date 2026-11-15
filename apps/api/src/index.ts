import { connect, parseKeyring, parsePepper } from "@nzila/db";
import { buildApp } from "./app.ts";

const port = Number(process.env.API_PORT ?? 4000);
const app = buildApp({ sql: connect(), pepper: parsePepper(process.env.HASH_PEPPER), keyring: parseKeyring(process.env.FIELD_KEYS) });
await app.listen({ port, host: "0.0.0.0" });
console.log(`api: listening on ${port}`);
