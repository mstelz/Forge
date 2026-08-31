# Wave 2, first — decompose active.tsx

**Run this alone. Nothing else in Wave 2 until it merges.**

`src/client/pages/workout/active.tsx` is 2,485 lines. It holds the logger, the rest
timer, the set form, the structure editor entry point, the add-exercise flow, the
last-time hint, several modals, and assorted helpers.

This is not cosmetic. The append-only duration input fixed in PR #18 sat in that
file for months: an `onChange={() => {}}` next to an `onFocus` that selected the
text, 1,200 lines from anything that would have made the contradiction obvious.

**Owns:** everything under `src/client/pages/workout/`
**Must not touch:** anything else. This is a pure move; if you find yourself
editing `pages/settings/` or `layouts/`, stop.

---

## The constraint that makes this safe

**This is a refactor. Behaviour must not change.**

The test suite is the safety net: `pages/workout/logger/__tests__/`,
`sessions/__tests__/`, `edit-structure/__tests__/`, plus
`lib/session/__tests__/`. They must stay green throughout, unmodified. If you find
yourself editing a test to make it pass, you have changed behaviour — stop and
reconsider.

TDD applies differently here: you are not writing new failing tests for moved code.
But **any seam you newly expose should get a test** — the whole point is that seams
between modules are where bugs hide unobserved.

## Suggested seams

Look at the file before committing to these; they are a starting hypothesis, not a
spec.

- `logger/rest-timer.tsx` — `RestTimerStrip`, the timer state, the parse helper
- `logger/set-form.tsx` — the weight/reps/duration/distance panel; already backed
  by the tested `lib/session/log-form.ts` reducer
- `logger/last-time.tsx` — `LastTimeLine` and `useLastTimeForExercise`; the pure
  part already moved to `lib/session/last-time.ts` in PR #18
- `logger/add-exercise.tsx` — picker, pending state, set-count confirmation
- `logger/session-header.tsx` — top bar, kebab, pause/end
- `active.tsx` — retains routing, session loading, and composition only

## Watch for

- **Prop drilling explosion.** If extracting a component needs fifteen props, the
  seam is wrong. Consider whether the log-form reducer's dispatch should be passed
  instead of individual setters, or whether a small context is warranted.
- **`useCallback`/`useMemo` dependency arrays** silently changing meaning as
  closures move across module boundaries.
- **Circular imports** between the extracted modules.
- The file mixes concerns deliberately in places for performance (avoiding
  re-renders mid-workout). Splitting components can introduce re-render regressions
  that no test catches. Sanity-check the logger by hand on a real session before
  claiming done.

## Acceptance

- `active.tsx` under ~400 lines.
- Every existing test passes **unmodified**.
- `bun run typecheck` and `bun run build` clean.
- You have run an actual workout in the app — start, log sets across a superset,
  rest timer, add an exercise mid-session, edit a logged set, finish — and it
  behaves as before. Say so explicitly in the PR; the tests do not cover the
  interaction-level behaviour this touches.
- No behaviour change. If you spot a bug while moving code, **write it down, do not
  fix it here.** Fix it in a separate commit or a follow-up, so the refactor stays
  reviewable as a pure move.
