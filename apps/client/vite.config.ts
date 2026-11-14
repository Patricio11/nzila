import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  server: { host: true, port: 5173 },
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
