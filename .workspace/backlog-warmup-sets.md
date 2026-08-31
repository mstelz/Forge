# Potential feature — warmup sets (not built)

**Status: logged, deliberately not built.** Confirmed with the repo owner during
Wave 2: the plate calculator was wanted, this was held.

Recording it here so the reasoning survives, and because the groundwork Wave 2
laid changes what building it would now cost.

## What exists today

`LogSetType` already includes `warmup` (`src/shared/session-log.ts`), so a set can
be **marked** as a warmup while logging. What is missing is any way to **plan or
generate** them: a routine cannot prescribe warmups, and the logger will not
propose a ramp.

## Why it was held

A working set is what gets tracked, and plenty of people deliberately do not log
warmups at all. The feature was inferred from the app's shape during the audit,
not asked for. It is the most deferrable thing in the backlog.

## What Wave 2 already did for it

Both of the hard parts now exist and are tested:

- **Warmups cannot set a record.** `lib/session/records.ts` refuses to let a
  warmup set a record *or* become the baseline that hides a later one. The
  original spec listed this as work to do; it is done.
- **`lib/equipment-loading.ts` classifies equipment** by load style, which is
  half of resolving a percentage-based ramp to loadable weights.

Note that progression suggestions were built during Wave 2 and then **removed** —
the prefill now simply carries last session's weight and reps forward. The
increment table that went with it (`loadIncrement`, `roundToLoadable`) was deleted
along with it rather than left as dead code, so a warmup generator would need to
reintroduce it. It is a small table; the reasoning is in the git history of
`lib/equipment-loading.ts`.

## What is left, if it is ever picked up

**The schema question is the whole design, and it is untouched.**
`RoutineItemSchema` validates that `setTargets.length === setCount` and that
orders are dense `0..setCount-1`. Warmups either count toward `setCount` — in
which case every summary reporting "3 × 10" starts lying — or they sit outside it.

Prefer a separate `warmupSets` field over overloading `setCount`, so existing
routines and every summary that reads `setCount` keep their meaning.

Two things still need checking that Wave 2 did not touch:

- `lib/session/summary.ts` filters `setType === "normal"` for volume, so warmups
  are already out of volume. Confirm that is still true after any change.
- `lib/session/last-time.ts` filters on `status`, **not** `setType` — a warmup
  would currently show up as "Last time". This is a live inconsistency: records
  and progression ignore warmups, the "Last time" hint does not. Worth fixing on
  its own even if warmups are never planned.

Bodyweight and cardio do not warm up by percentage of load. Keep warmups visually
subordinate in the logger; they are not the point of the session.
