/**
 * Single source of truth for the app version embedded in export envelopes.
 *
 * - Server: Bun can import package.json natively; we fall back to a runtime
 *   require so this module stays importable in both Bun and browser contexts.
 * - Client: Vite replaces __APP_VERSION__ at build time (see vite.config.ts).
 *
 * Both sides must emit the same string — mismatches indicate a build pipeline
 * bug, not a versioning gap.
 */

declare const __APP_VERSION__: string | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: ((id: string) => any) | undefined;

function resolveVersion(): string {
  // 1. Vite compile-time define (client bundle)
  if (typeof __APP_VERSION__ !== "undefined") {
    return __APP_VERSION__;
  }
  // 2. Node/Bun runtime require (server)
  try {
    if (typeof require !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require("../../package.json") as { version?: string };
      if (pkg.version) return pkg.version;
    }
  } catch {
    // ignore — fall through to default
  }
  return "0.0.0-unknown";
}

export const APP_VERSION: string = resolveVersion();
