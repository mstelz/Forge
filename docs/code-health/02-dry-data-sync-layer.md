# [P1] DRY the data/sync layer (mutations, reconcile, server routes)

Part of the codebase-health roadmap.

## Problem
The same per-entity shape is hand-written in three places:
- `src/client/db/mutations.ts` — ~25 near-identical create/update/delete functions (`transaction(rw, table, pendingWrites) -> put/add + enqueue`).
- `src/client/sync/reconcile.ts` — 9 near-identical `reconcileX` functions; exercises/equipment/routines/programs/goals are effectively the same logic.
- `src/server/routes/*.ts` — `rowToX` mappers plus insert-then-select-back repeated across 10+ routes.

## Suggested work
- Generic `outboxMutation(table, entity)` factory for the client mutations.
- Table-driven `reconcileTable(table, entity, serverRows, pending)`.
- Shared `defineCrudRoute()` / row-mapper helper on the server.

Could remove ~1,000+ LOC and make adding an entity close to a one-liner.

**Priority:** P1. Depends on timestamp normalization (04) for the cleanest server row-mapper. Unblocks typed-payload work (06).
