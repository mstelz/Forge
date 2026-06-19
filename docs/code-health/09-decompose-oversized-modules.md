# [P2] Decompose oversized modules

Part of the codebase-health roadmap.

## Problem
Several single-file-does-everything modules beyond active.tsx:
- `home/index.tsx` (1,205)
- `programs/builder/index.tsx` (1,134)
- `programs/detail.tsx` (944)
- `workout/edit-structure/index.tsx` (740)
- `routes/export.ts` (697)
- `home/state.ts` (633)

## Suggested work
- Split each into focused components/helpers; extract pure logic out of the render path.

**Priority:** P2. Lower urgency than active.tsx; same pattern.

## Resolution (2026-06-19)

Two clean, behavior-preserving extractions landed in this pass — chosen because they
move a cohesive, self-contained unit out of an oversized file with the move fully
verified by `tsc` (types must still line up across the new module boundary):

- **`home/index.tsx` 1,205 → 838 LOC.** The entire day-detail bottom-sheet / popover
  feature (`DayDetailSurface` + its 7 prop-driven content sub-components + `CloseIcon`)
  moved to a sibling `home/day-detail.tsx` (378 LOC). `DayDetailSurface` is the only
  symbol the page imports back; everything else is private to the new module. No logic
  changed — the components were already fully prop-driven with no parent-scope closures.
- **`routes/export.ts` 697 → 441 LOC.** The 15 pure `rowToX` DB-row→domain-object
  mappers (plus their private `parseArray` helper and row-type aliases) moved to
  `routes/export-mappers.ts` (312 LOC). These are pure transforms with no I/O; the
  route handler imports them. Exactly the "extract pure logic out of the render path"
  the issue calls for.

Intentionally **deferred** to a human-reviewed follow-up (not done here):
- `programs/builder/index.tsx` (1,134), `programs/detail.tsx` (944),
  `workout/edit-structure/index.tsx` (740) — large stateful React components, same risk
  profile as the deferred `active.tsx` BottomPanel work (issue 01): the autonomous
  code-health workflow has no per-issue human review checkpoint and the test suite is
  node-env only (no DOM/render tests), so deep stateful splits here can't be caught by
  the green gate.
- `home/state.ts` (633) — already a cohesive, well-tested (26 tests) pure module with
  clear exports; splitting it further is low value relative to the churn.
