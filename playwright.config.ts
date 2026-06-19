import { defineConfig } from "@playwright/test";

/**
 * E2E config. Tests live in ./e2e and drive the real client (vite dev server) in a
 * headless browser — the only layer that faithfully exercises the audio / IndexedDB /
 * rest-timer paths that node-env unit tests and jsdom can't. The app is local-first,
 * so the smoke flows need only the client; sync POSTs to /api fail offline and queue,
 * which is expected and not asserted on.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    // Portrait mobile — the app is a portrait-locked PWA.
    viewport: { width: 390, height: 844 },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "bun run dev:client",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
