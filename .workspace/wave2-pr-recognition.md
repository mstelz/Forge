# Wave 2 — PR recognition while lifting

The largest gap between what Forge knows and what it tells you. It detects personal
records already and surfaces them as a **number on a summary screen you see after
the workout is over**. You set a PR mid-session and the app says nothing.

**Owns:** `src/client/lib/session/summary.ts`, `epley.ts`, a new PR-detection
module, the logger's set-logging path (post-decomposition: `logger/set-form.tsx`
or wherever the log action lands), `pages/workout/session-detail.tsx`,
`pages/history/`
**Must not touch:** `pages/settings/`, `layouts/`, the delete dialogs

---

## What exists

`src/client/lib/session/summary.ts` computes `prCount`: distinct exercises where
this session's best Epley 1RM strictly exceeds the best across all prior logs. It
uses `bestEpleyForExercise` from `epley.ts`. `session-detail.tsx` renders it as a
`MetricTile` labelled "PRs".

So the maths is done and tested. What is missing is **timing and specificity**:
which lift, at the moment it happens.

## What to build

1. **Recognition at the moment of logging.** When a logged set beats the previous
   best for that exercise, say so immediately. The toast system from PR #18 is one
   option; an inline marker on the set row may be better — it persists, where a
   toast vanishes. Consider that a phone mid-set is glanced at, not read.
2. **A PR marker in history**, so past PRs stay visible.
3. **Name the record.** "PR" alone is weak. "Best 1RM — 102kg, up from 100kg" or
   "Heaviest set at 5 reps" tells the user what they actually did.

## Decide what counts as a record — this is the real design work

Estimated 1RM is one definition and it is not the only useful one. Consider:

- **Best estimated 1RM** (current behaviour)
- **Heaviest weight at a given rep count** — what lifters usually mean by a PR
- **Most reps at a given weight**
- **Best volume** for a session

Epley-only has a known failure: a high-rep set can compute a higher 1RM than a
genuine heavy single, so a 20-rep back-off set can spuriously read as a PR. Decide
deliberately whether that is acceptable and write down the reasoning.

**Cardio needs its own definition** — fastest pace, longest distance, longest
duration. PR #18 made cardio first-class; do not ship strength-only PR logic that
silently ignores runs.

## Watch for

- **Do not cheapen it.** If everything is a PR, nothing is. A new user's first set
  of every exercise is technically a record — decide whether that counts (probably
  not; require a prior baseline).
- **Warmup sets** must not trigger records. `LogSetType` includes `warmup`.
- **Unit display** — records must render in the user's `weightUnit`.
- **Cost.** Checking "is this a PR" on every set logged means querying prior logs
  mid-workout. Keep it off the critical path of logging a set; the logger must stay
  instant.

## Acceptance

- Setting a record is acknowledged during the workout, naming the lift and the
  number.
- Records are visible in history after the fact.
- Warmup sets never count; first-ever sets are handled per your documented rule.
- Cardio has a working record definition.
- Detection logic is pure and unit-tested, including the Epley high-rep edge case.
