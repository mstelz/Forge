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

## Status (done)
- ✅ Client mutations: added a `crudMutations(table, entity)` factory in
  `mutations.ts`; exercise/equipment/routine/program/goal triples, plus
  session-create and program-run create/delete, now route through it. Guarded
  variants (session update/finish/times, program-run update/end, settings,
  profile, weight-log) stay hand-written by design.
- ✅ Client reconcile: collapsed 8 of the 9 `reconcileX` functions into a single
  `makeReconciler(table, entity, { softDelete })` factory. `reconcileSessions`
  stays bespoke (its pending set spans both `session` and `session_log`).
- ⏭️ **Server routes: intentionally NOT consolidated.** On inspection the routes
  are heterogeneous — per-entity name-conflict checks (equipment/exercises),
  distinct `rowToX`/`xToRow` field maps, stale-update merge-and-revalidate
  (goals), and only some routes select-back after insert. A single
  `defineCrudRoute()` would absorb these via callbacks and trade real
  duplication for harder-to-follow indirection and regression risk. Left as-is;
  revisit per-route if a genuinely uniform subset emerges.
