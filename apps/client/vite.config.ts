import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// The API is asked at /api on the game's own address, in development as in production, so the token never crosses to another origin.
const api = { "/api": { target: `http://localhost:${process.env.API_PORT ?? 4000}`, rewrite: (path: string) => path.replace(/^\/api/, "") } };

export default defineConfig({
  plugins: [preact()],
  server: { host: true, port: 5173, proxy: api },
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
