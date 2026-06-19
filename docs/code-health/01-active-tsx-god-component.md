# [P1] Refactor active.tsx god-component (2,691 LOC)

Part of the codebase-health roadmap.

## Problem
`src/client/pages/workout/active.tsx` is 2,691 lines holding ~10 components, 3 time-formatters, and cursor logic. `BottomPanel` alone has ~14 `useState` (33 in the file). `handleLogSet` (~line 1041) has duplicated validation blocks (lines 1059-1070 vs 1117-1128 are identical) and duplicated rest-backfill / `prevLogUpdate` computation across its extra-set and planned-slot branches. This is the most-churned area in git history, so coupling here directly drives regressions.

## Suggested work
- Extract `BottomPanel` form state into a `useReducer` or dedicated hook.
- Move `SetRow`, `ExerciseCard`, `RestTimerStrip`, `Toast` into sibling files.
- Factor one shared `validateMetrics()` and one `buildLogWrites()` used by both branches of `handleLogSet`.

**Priority:** P1. Independent; do the BottomPanel reducer extraction first.
