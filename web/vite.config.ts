import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// PWA: hand-written public/sw.js + public/manifest.webmanifest
// (vite-plugin-pwa's generated worker breaks on paths containing an apostrophe).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
});
