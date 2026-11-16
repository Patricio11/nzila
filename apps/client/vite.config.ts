import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// (By number, not by name: "localhost" may be tried as IPv6 first, where the API does not listen, and a request is lost now and then.)
// The API is asked at /api on the game's own address, in development as in production, so the token never crosses to another origin.
// The zone is asked at /zone the same way: a WebSocket.
const api = {
  "/api": { target: `http://127.0.0.1:${process.env.API_PORT ?? 4000}`, rewrite: (path: string) => path.replace(/^\/api/, "") },
  "/zone": { target: `http://127.0.0.1:${process.env.ZONE_PORT ?? 2567}`, ws: true, rewrite: (path: string) => path.replace(/^\/zone/, "") },
};

export default defineConfig({
  plugins: [preact()],
  // The packs are thousands of files rewritten by every build of a district, and the screenshots hundreds more: watching
  // them kept the dev server busy with a whole processor core, which the frame-rate bench then measured (finding F-146).
  server: { host: true, port: 5173, proxy: api, watch: { ignored: ["**/public/packs/**", "**/screenshots/**", "**/dist/**"] } },
  preview: { proxy: api },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        // The renderer is its own download, fetched after the front door is on screen (D-1.2).
        manualChunks: (id) => (id.includes("node_modules/three/") ? "renderer" : undefined),
      },
    },
  },
});
