import { buildApp } from "./app.ts";

const port = Number(process.env.API_PORT ?? 4000);
const app = buildApp();
await app.listen({ port, host: "0.0.0.0" });
console.log(`api: listening on ${port}`);
