# Forge — remaining UX work

Everything left over from the product/UX teardown, after PR #18 landed the first
eight recommendations.

> The repo's `AGENTS.md` points issue specs at `.scratch/<slug>/`. These live in
> `.workspace/` because that is where they were asked for. Move them if you want
> the convention honoured.

## Status of the original audit

The audit found **14 secondary findings** plus a feature inventory. PR #18 closed
seven findings (both inert settings, cardio in the "Last time" hint, its 4-hour
session grouping, the hardcoded theme colours, the 11 native `alert`/`confirm`
calls, and the missing first-run state) and three inventory gaps (cardio planning,
cardio logging, onboarding).

**Seven findings and five inventory gaps remain.** They are written up here.

## The contention map — read this before running anything in parallel

Two files are touched by almost everything left:

- `src/client/pages/workout/active.tsx` — 2,485 lines
- `src/client/pages/settings/index.tsx`

Naively fanning all ten tasks out in parallel produces merge conflicts in those two
files and nowhere else. The lanes below are drawn so that **each lane owns a
disjoint set of files**. Respect the "Owns" and "Must not touch" sections in each
doc and the branches will merge cleanly.

## Wave 1 — safe to run fully in parallel

| Lane | Task | Owns |
|---|---|---|
| A | [Settings & navigation polish](lane-a-settings-and-nav.md) | `layouts/app-shell.tsx`, `pages/settings/index.tsx` |
| B | [Undo for destructive actions](lane-b-undo.md) | `components/toast*`, the four delete dialogs + their list pages |
| C | [Per-exercise progress charts](lane-c-progress-charts.md) | new chart module, `pages/exercises/detail.tsx`, `history-placeholder.tsx` |

No file appears in more than one lane. Lane B and Lane C both reach into
`pages/exercises/`, but B owns `delete-dialog.tsx` and `detail.tsx`'s delete
handler only, while C owns the history section — check each doc.

## Wave 2 — run only after Wave 1 merges, and do the first one alone

Everything below touches `active.tsx`.

1. **[active.tsx decomposition](wave2-active-tsx-decomposition.md) — do this by
   itself, first.** It is a rebase magnet. Every other Wave 2 task gets easier and
   safer once it lands.
2. Then these can go in parallel, since decomposition will have given them separate
   modules to edit:
   - [PR recognition while lifting](wave2-pr-recognition.md)
   - [Progression suggestions](wave2-progression-suggestions.md)
   - [Retire the Show cardio toggle](wave2-cardio-toggle.md)
   - [Plate calculator](wave2-plate-calculator.md)
   - [Warmup sets](wave2-warmup-sets.md)

If you would rather not do the decomposition, run Wave 2 tasks strictly one at a
time. Do not fan them out against the current `active.tsx`.

## House rules for every task

- **TDD, genuinely.** Write the test, run it, watch it fail for the right reason,
  then write the code. The calendar bug in PR #18 survived 28 passing tests because
  the tests covered the module either side of the seam but never the seam itself.
  Test the behaviour a user would notice.
- `bun run typecheck` and `bunx vitest run` must both be clean before you commit.
  There is no CI on pull requests — nothing checks this for you.
- Match the surrounding code: CSS variables from `styles.css`, never colour
  literals; Radix primitives for overlays; the `ConfirmDialog` and `useToast`
  helpers added in PR #18.
- One lane per branch, branched from `main` (or from the decomposition branch for
  Wave 2 followers).

## Baseline

`main` after PR #18 merges: 273 tests, 33 files, typecheck clean, build clean.
