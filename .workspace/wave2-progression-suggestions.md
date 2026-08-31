# Wave 2 — Progression suggestions

Forge prefills the set form with last session's numbers
(`src/client/lib/session/prior-values.ts`, `getLastLogValuesForExercise`) but never
proposes a **target**. It remembers; it does not coach.

**Owns:** `src/client/lib/session/prior-values.ts`, a new progression module, the
logger's prefill path (post-decomposition: `logger/set-form.tsx`)
**Must not touch:** `pages/settings/`, `layouts/`, chart code (Lane C)

---

## Scope this carefully before writing code

This is the task most likely to sprawl into "build a coaching engine". It should
not. The useful version is small: when you arrive at an exercise, the app proposes
the next sensible target instead of silently repeating last time's numbers.

**Note the project constraint:** a memory from earlier work records that in Forge,
**RPE belongs to logging, not planning**. Do not add RPE fields to routines or
programs as part of this. You may *read* logged RPE to inform a suggestion.

## A reasonable first version

If last session hit every prescribed rep at the top of the range, suggest a small
increment. If it missed, suggest repeating. Nothing more elaborate until the simple
version has been lived with.

Inputs available: prescribed reps or rep range from the routine item, what was
actually logged, logged RPE (when `showRpe` is on), and the exercise's equipment —
which determines the *achievable* increment.

## The increment problem is the interesting part

"Add 2.5kg" is wrong for most of the gym:

- A **barbell** moves in 2× the smallest plate pair — typically 2.5kg total, or 5lb.
- **Dumbbells** jump in fixed steps, often 2kg or 5lb, and the step is per-hand.
- A **machine** stack has fixed pins, sometimes uneven.
- **Bodyweight** progresses in reps, not load.
- **Cardio** progresses in distance, duration or pace — not weight at all.

Forge has an equipment model (`src/shared/equipment.ts`, `pages/equipment/`).
**Read it first** and decide whether increment belongs on the equipment record. If
it does, that is a schema change — flag it before building, and keep it additive
and optional so existing data stays valid.

If that is too much for one pass, ship a conservative default increment and make
the suggestion easy to override. **A suggestion that is confidently wrong is worse
than no suggestion** — a lifter who trusts a bad number gets hurt or stalls.

## Watch for

- **Suggestions must be trivially dismissible.** Prefill a suggestion the user can
  type over — never block or nag.
- **Do not suggest into a deload or a missed session.** If last session was clearly
  a bad day, repeating is right.
- **Unit correctness.** Suggest in the user's `weightUnit`; a 2.5kg increment shown
  as "5.5lb" is not a number anyone loads.
- **Cardio** must get a cardio-shaped suggestion or none at all.

## Acceptance

- Arriving at an exercise with history proposes a target, visibly distinguished
  from a value the user entered themselves.
- The increment respects the equipment type; the reasoning is documented.
- Always overridable, never blocking.
- Suggestion logic is pure and unit-tested, including the miss case, the no-history
  case, and cardio.
