import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// The Estúdio asks the API at /api on its own address, like the game does, so that a staff token never crosses to
// another origin. (By number, not by name: "localhost" may be tried as IPv6 first, where the API does not listen.)
const api = { "/api": { target: `http://127.0.0.1:${process.env.API_PORT ?? 4000}`, rewrite: (path: string) => path.replace(/^\/api/, "") } };

// A connection a phone has open to this server is kept longer than a person takes between two taps. Node lets go
// of an idle one after five seconds; Safari then sends its next request down the dead connection and, when that
// request has a body, cannot send it again ("rewinding of the data stream failed"): the player is told there is no
// network when there is (finding F-181). Whatever stands in front of the game in production must do the same.
const patient = {
  name: "nzila-keep-alive",
  configureServer: (server: { httpServer: { keepAliveTimeout: number } | null }) => void (server.httpServer && (server.httpServer.keepAliveTimeout = 75_000)),
  configurePreviewServer: (server: { httpServer: { keepAliveTimeout: number } }) => void (server.httpServer.keepAliveTimeout = 75_000),
};

export default defineConfig({
  plugins: [preact(), patient],
  server: { host: "127.0.0.1", port: 5180, proxy: api },
  preview: { host: "127.0.0.1", proxy: api },
  build: { target: "es2022" },
});
