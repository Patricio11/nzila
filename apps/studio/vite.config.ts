import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// The Estúdio asks the API at /api on its own address, like the game does, so that a staff token never crosses to
// another origin. (By number, not by name: "localhost" may be tried as IPv6 first, where the API does not listen.)
const api = { "/api": { target: `http://127.0.0.1:${process.env.API_PORT ?? 4000}`, rewrite: (path: string) => path.replace(/^\/api/, "") } };

export default defineConfig({
  plugins: [preact()],
  server: { host: "127.0.0.1", port: 5180, proxy: api },
  preview: { host: "127.0.0.1", proxy: api },
  build: { target: "es2022" },
});
