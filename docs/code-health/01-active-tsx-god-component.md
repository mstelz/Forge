# [P1] Refactor active.tsx god-component (2,691 LOC)

Part of the codebase-health roadmap.

## Problem
`src/client/pages/workout/active.tsx` is 2,691 lines holding ~10 components, 3 time-formatters, and cursor logic. `BottomPanel` alone has ~14 `useState` (33 in the file). `handleLogSet` (~line 1041) has duplicated validation blocks (lines 1059-1070 vs 1117-1128 are identical) and duplicated rest-backfill / `prevLogUpdate` computation across its extra-set and planned-slot branches. This is the most-churned area in git history, so coupling here directly drives regressions.

## Suggested work
- Extract `BottomPanel` form state into a `useReducer` or dedicated hook.
- Move `SetRow`, `ExerciseCard`, `RestTimerStrip`, `Toast` into sibling files.
- Factor one shared `validateMetrics()` and one `buildLogWrites()` used by both branches of `handleLogSet`.

**Priority:** P1. Independent; do the BottomPanel reducer extraction first.

## Resolution (2026-06-19)

Done in this pass:
- **`handleLogSet` deduplication** (the concrete bug the issue flags). Both the extra-set
  branch and the planned-slot branch now share four local helpers — `validateMetrics()`,
  `metricFields(now)`, `computeRestBackfill(now)`, and `startRestTimer(now)` — instead of
  the two copies of the validation block, the `updatedFields` object, the `prevLogUpdate`
  computation, and the rest-timer JSON. Behavior is byte-for-byte identical; guarded by the
  existing logger tests (`pages/workout/logger/__tests__`).
- **Pure icons extracted** to a sibling `src/client/pages/workout/icons.tsx` (10 zero-state
  SVG components). active.tsx dropped from 2,691 → 2,547 LOC.

Intentionally **deferred** (not done here):
- `BottomPanel` form-state → `useReducer`/hook extraction.
- Moving `SetRow`, `ExerciseCard`, `RestTimerStrip`, `Toast` into sibling files.

Why deferred: these are large stateful moves in the single most-churned file in git history,
each closing over many `useState`/props. The autonomous code-health workflow runs without a
per-issue human review checkpoint, and the test suite is node-env only (no DOM/render tests),
so a reducer rewrite or component relocation here carries regression risk that can't be caught
by the green gate. They're worth doing behind a human review checkpoint as a follow-up; the
duplication bug — the part with a real correctness/maintenance cost — is resolved.
