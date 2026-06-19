# [P1] Remove migration self-healing hacks in server/index.ts

Part of the codebase-health roadmap.

## Problem
`src/server/index.ts` (lines 21-50) contains `recordIfOrphaned` / `recordIfDropped` that hand-insert rows into `__drizzle_migrations` using hardcoded magic timestamps to stop Drizzle from re-running migrations applied out-of-band. `recordIfDropped` logs `"recording orphaned migration"`, which is a copy-paste bug (it handles the dropped-column case). This signals migrations were manually patched against prod and is fragile.

## Suggested work
- Treat the current prod schema as a clean baseline migration.
- Delete the self-healing shims.
- Document the recovery and going-forward migration process in an ADR.

**Priority:** P1. Independent.
