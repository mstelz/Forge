# Lane C — Per-exercise progress charts

Forge stores every set you have ever logged and never draws any of it. The only
chart in the app is the 30-day bodyweight sparkline on Profile
(`pages/profile/index.tsx`). For a training log, "am I getting stronger at this
lift" is the question the data exists to answer.

**Owns:** a new chart module under `src/client/components/`,
`src/client/pages/exercises/detail.tsx`, `pages/exercises/history-placeholder.tsx`
**Must not touch:** `pages/workout/`, `pages/settings/`, `layouts/`, the delete
dialogs (Lane B owns those)

---

## What exists already

- `src/client/pages/exercises/history-placeholder.tsx` — renders
  `ExerciseHistorySection`, already loads all logs for an exercise via
  `useExerciseLogs`, and already computes Epley 1RM locally.
- `src/client/lib/session/epley.ts` — `bestEpleyForExercise`, the shared 1RM helper.
- `pages/profile/index.tsx` — an existing hand-rolled inline-SVG sparkline. **Read
  it first and match its approach**; do not add a charting dependency for this.

The data plumbing is done. This is a rendering task.

## What to build

On the exercise detail screen, a compact chart of that exercise over time. Sensible
default series, in order of usefulness:

1. **Estimated 1RM** (Epley) per session — the single best strength-trend line.
2. **Top-set weight** per session.
3. **Total volume** per session.

For cardio exercises the strength series are meaningless. Branch on
`exercise.type`: cardio gets **pace or distance over time** instead. PR #18 made
cardio a first-class citizen in planning and logging; do not regress that here by
drawing an empty strength chart on a run.

## Design constraints

- Follow ADR 0001: single amber accent, 1px borders, no shadows, tabular numerics.
  Read `docs/decisions/0001-design-language.md`.
- Colours come from CSS variables in `styles.css`. **No colour literals** — PR #18
  removed six of them; do not add more.
- Must render correctly in light and dark. Check both.
- Mobile first: it renders in a `max-w-md` column on a phone held mid-workout.
- Wide content scrolls inside its own container; the page body must never scroll
  sideways.
- Accessible: a chart that conveys information needs a text equivalent. At minimum
  an `aria-label` summarising the trend, ideally a togglable data table.

## Edge cases that will bite

- **One data point.** A line needs two. Draw the point, not a broken path.
- **No data.** The exercise exists but has never been logged — show an empty state,
  not an empty axis.
- **A single outlier** compressing the useful range flat.
- **Unit changes.** Weights are stored in kg and displayed per `weightUnit`; the
  axis must follow the setting, and `enteredWeightUnit` records what the user
  actually typed.
- **Sessions on the same day.**

## Acceptance

- Exercise detail shows a trend chart for exercises with history.
- Cardio exercises get a cardio-appropriate series, not an empty strength chart.
- Empty and single-point states are handled deliberately.
- Legible in both themes; no colour literals; no new dependency.
- Pure data-shaping logic (bucketing sessions, computing the series, choosing the
  axis range) is extracted and unit-tested. Test that logic, not the SVG.
