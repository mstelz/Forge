import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import pkg from "./package.json";

export default defineConfig({
  root: "src/client",
  publicDir: path.resolve(__dirname, "public"),
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
      "~client": path.resolve(__dirname, "src/client"),
      "~shared": path.resolve(__dirname, "src/shared"),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      strategies: "injectManifest",
      srcDir: ".",
      filename: "sw.ts",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Forge",
        short_name: "Forge",
        description: "Self-hosted workout tracker",
        theme_color: "#0B0B0C",
        background_color: "#0B0B0C",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: path.resolve(__dirname, "dist/client"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
