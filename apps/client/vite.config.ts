import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// (By number, not by name: "localhost" may be tried as IPv6 first, where the API does not listen, and a request is lost now and then.)
// The API is asked at /api on the game's own address, in development as in production, so the token never crosses to another origin.
// The zone is asked at /zone the same way: a WebSocket.
const api = {
  "/api": { target: `http://127.0.0.1:${process.env.API_PORT ?? 4000}`, rewrite: (path: string) => path.replace(/^\/api/, "") },
  "/zone": { target: `http://127.0.0.1:${process.env.ZONE_PORT ?? 2567}`, ws: true, rewrite: (path: string) => path.replace(/^\/zone/, "") },
};

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
  // The packs are thousands of files rewritten by every build of a district, and the screenshots hundreds more: watching
  // them kept the dev server busy with a whole processor core, which the frame-rate bench then measured (finding F-146).
  server: { host: true, port: 5173, proxy: api, watch: { ignored: ["**/public/packs/**", "**/screenshots/**", "**/dist/**"] } },
  preview: { proxy: api },
  build: {
    target: "es2022",
    // Which file imports which, written beside the build: the size check reads it to tell what the way in
    // downloads from what is fetched only when a player opens it (tools/budget).
    manifest: true,
    rollupOptions: {
      output: {
        // The renderer is its own download, fetched after the front door is on screen (D-1.2).
        manualChunks: (id) => (id.includes("node_modules/three/") ? "renderer" : undefined),
      },
    },
  },
});
