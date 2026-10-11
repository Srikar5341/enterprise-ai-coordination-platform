/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Renova web frontend — React + Vite + TypeScript.
 *
 * The dev server intentionally binds port 3000 so the sandbox preview panel
 * (which proxies `/` to localhost:3000) serves this app.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  css: {
    // Avoid walking up parent directory tree for external PostCSS configs
    postcss: {},
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    // The sandbox preview panel proxies `/` to this dev server through a
    // gateway whose Host header is a dynamic infrastructure hostname
    // (e.g. *.fcapp.run). Vite 6 blocks unknown Host headers by default
    // (DNS-rebinding protection), which breaks the preview. This dev server
    // is sandbox-only (never exposed publicly), so allow all hosts.
    allowedHosts: true,
    // Never let browsers or the preview proxy cache dev responses — stale
    // bundles otherwise keep showing old branding/content after rebrands.
    headers: {
      "Cache-Control": "no-store, must-revalidate",
    },
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: true,
    headers: {
      "Cache-Control": "no-store, must-revalidate",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    environmentOptions: {
      jsdom: {
        url: "http://localhost:3000/",
      },
    },
  },
});
