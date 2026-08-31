# Found while building the Wave 2 features — not fixed

Things noticed in passing that were out of scope for the branch they were found
on. None are fixed; each is written down so it is not lost.

## 1. Warmups leak into "Last time" and into the set-form prefill

`lib/session/last-time.ts` filters on `status === "logged"` and the session id —
never on `setType`. So a warmup shows up in the "Last time" hint.

`getLastLogValuesForExercise` in `prior-values.ts` has the same gap, and it now
matters more: the set form prefills from it directly. If your last logged set of
an exercise was a warmup, the form opens at the warmup weight.

Record detection excludes warmups deliberately, which makes these two the odd ones
out — the app can tell you "Last time: 40 kg × 10" and prefill 40 kg when 40 kg
was your warmup and you worked at 100. Both are a one-line filter, but they change
what a user sees on every exercise, so they want their own change and their own
tests rather than riding along with something else.

## 2. Extra sets are invisible to volume, and to the history sheet

Logging ADD SET stores `status: "extra"`, which several things skip:

- `summarizeSession` counts volume from `status === "logged" && setType === "normal"`,
  so a bonus set contributes no volume at all.
- The exercise history sheet lists only `status === "logged"`, so an extra set
  never appears in history — including one that set a record.

Record detection now counts extras, because a bonus heavy single is real work.
That is arguably right and it makes the inconsistency more visible rather than
less: the same set can set a record, be badged in the logger, and then be missing
from the history sheet and from the volume total.

Worth deciding once, globally, what "extra" means — a real set that happened to be
unplanned, or something lesser — and making every consumer agree.

## 3. Bar weight and plate inventory are hardcoded defaults

`lib/plates.ts` assumes a 20kg / 45lb bar and a commercial plate set. Women's
bars are 15kg, trap and safety bars differ, and a home gym stocks what it stocks.

The values are deliberately in one place with the arithmetic parameterised, so a
plate inventory in Settings or on the Equipment record can replace them without
touching `platesForTarget`. Until then a lifter with an unusual setup sees a
loading they cannot make. It is honest about inexact targets, so it will say the
closest it can reach rather than lie.

## 4. Equipment has no increment, so loading is inferred from names

`EquipmentSchema` is `{ id, name }` — no category, no increment. So
`lib/equipment-loading.ts` matches on names ("Barbell", "Dumbbells", "Cable
Machine", …), which works for the shipped dataset and degrades to "unknown" —
and therefore to no suggestion — for anything it does not recognise.

Adding an optional `loadIncrement` to the equipment record would delete the
guesswork. It is additive and existing data stays valid, but it is still a schema
change across the zod schema, the Drizzle table, the sync route and the export
mappers, so it was not done as a side effect of a logger feature.

## 5. `prCount` on existing sessions changed meaning

Requiring a baseline means an exercise with no history no longer scores a PR.
Old finished sessions are recomputed from logs when their summary is viewed, so a
first-ever session that used to report "5 PRs" now reports none. That is the
intended correction — but it is a visible change to past data, not only to new
sessions.
