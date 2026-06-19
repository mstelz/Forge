import { mergeConfig, defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Reuse the vite resolve aliases / plugins, but scope vitest to the node-env unit
// tests under src/ and keep it away from the Playwright specs in e2e/ (whose
// `test`/`expect` come from @playwright/test, not vitest).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // vite.config sets root to src/client for the app build; pin tests back to the
      // repo root so discovery spans src/server, src/db, etc. as it did before.
      root: process.cwd(),
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    },
  }),
);
