# [P1] Remove migration self-healing hacks in server/index.ts

Part of the codebase-health roadmap.

## Problem
`src/server/index.ts` (lines 21-50) contains `recordIfOrphaned` / `recordIfDropped` that hand-insert rows into `__drizzle_migrations` using hardcoded magic timestamps to stop Drizzle from re-running migrations applied out-of-band. `recordIfDropped` logs `"recording orphaned migration"`, which is a copy-paste bug (it handles the dropped-column case). This signals migrations were manually patched against prod and is fragile.

## Suggested work
- Treat the current prod schema as a clean baseline migration.
- Delete the self-healing shims.
- Document the recovery and going-forward migration process in an ADR.

**Priority:** P1. Independent.

## Carried-in from issue 08
The drifted `pending_writes` Drizzle mirror was removed from `src/db/schema.ts`
(it was server-unused). The legacy physical `pending_writes` table — created by
migration 0000 and never touched by the server — should be **dropped** as part
of this migration-baseline reset. It was not dropped in issue 08 because
`drizzle-kit generate` currently fails on snapshot collisions
(`meta/0002–0004_snapshot.json`), which this issue fixes.
