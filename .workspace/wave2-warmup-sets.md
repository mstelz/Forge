# Wave 2 — Warmup sets

`LogSetType` already includes `warmup` (`src/shared/session-log.ts`), so a set can
be *marked* as a warmup. What is missing is any way to **plan or generate** them:
a routine cannot prescribe warmups, and the logger will not propose a ramp.

**Owns:** the warmup generation module, the routine builder's prescription editor
(`pages/routines/builder/prescription-editor.tsx`), the logger's set list
(post-decomposition)
**Must not touch:** `pages/settings/`, `layouts/`, chart code

---

## Check the premise first

Like the plate calculator, this was inferred rather than requested. Confirm it is
wanted before building — a working set is what gets tracked, and some people
deliberately do not log warmups.

## The two halves — they are separable

**1. Planning.** Let a routine item prescribe warmup sets. Note the schema
constraint: `RoutineItemSchema` validates that `setTargets.length === setCount` and
that orders are dense `0..setCount-1`. Warmups either count toward `setCount` — in
which case every summary that reports "3 × 10" starts lying — or they need to sit
outside it. **Decide this before writing code**; it is the whole design.

Prefer a separate `warmupSets` field over overloading `setCount`, so existing
routines and every summary that reads `setCount` keep their meaning.

**2. Generation.** Given a working weight, propose a ramp — commonly percentages of
the working set with descending reps. Percentages must resolve to loadable weights,
which is the same increment problem described in
[progression suggestions](wave2-progression-suggestions.md). If both tasks are
live, share that logic rather than implementing it twice.

## Watch for

- **Warmups must not pollute statistics.** Volume, PR detection and "Last time" all
  currently treat logged sets fairly uniformly. Check each:
  - `lib/session/summary.ts` filters `setType === "normal"` for volume — good —
    but `prCount` iterates all logs for the exercise. A warmup must never set a PR.
  - `lib/session/last-time.ts` (added in PR #18) filters on `status`, not
    `setType`. A warmup would currently show as "Last time".
  - Coordinate with the PR-recognition task; you are both touching this boundary.
- **Bodyweight and cardio** do not warm up by percentage of load.
- Keep them visually subordinate in the logger — warmups are not the point of the
  session.

## Acceptance

- A routine can prescribe warmups without corrupting `setCount` or the summaries
  that read it.
- Generated warmups resolve to loadable weights.
- Warmup sets are excluded from volume, PR detection and the "Last time" hint —
  with a test for each.
- Generation logic is pure and unit-tested.
