# [P3] Unify logging strategy

Part of the codebase-health roadmap.

## Problem
22 raw `console.*` calls are scattered alongside the structured `syncLog` and Hono `logger`.

## Suggested work
- Route stray client `console.*` through `syncLog`; keep one consistent logging path.

**Priority:** P3. Independent.

## Resolution (2026-06-19)

`syncLog` is now the single client logging path. Two supporting changes:

1. **`syncLog` mirrors to the browser console** (`sync/sync-logger.ts`): every entry is
   still captured in the in-memory ring buffer (and the in-app Sync Status sheet) and is
   now also surfaced to devtools — `error`→`console.error`, `warn`→`console.warn`,
   `info`→`console.debug` (debug keeps routine info out of the default console view).
   This means routing the stray calls through `syncLog` preserves devtools visibility
   rather than silently dropping it.
2. **All 16 stray client `console.*` calls resolved:**
   - 3 were exact duplicates sitting next to an existing `syncLog` (flusher id_conflict +
     poisoning, reconcile cycle-failed) — deleted.
   - 13 standalone calls converted to structured `syncLog` entries with appropriate
     category (`flush` / `reconcile` / `app`): `sync/triggers.ts`,
     `sync/program-run-reconciler.ts`, `main.tsx` (×3), `seed/debug.ts`,
     `pages/programs/builder`, `pages/routines/builder`, plus the
     `.catch(console.error)` fire-and-forget handlers in `pages/workout/active.tsx` (×4)
     and `pages/workout/session-detail.tsx`.

Server-side logging (Hono `logger`) is intentionally untouched — the issue scopes this to
stray *client* `console.*`. `grep -rn "console\\." src/client` (excluding tests and the
mirror inside `sync-logger.ts`) now returns nothing.
