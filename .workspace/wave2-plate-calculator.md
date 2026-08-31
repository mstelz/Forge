# Wave 2 — Plate calculator

Absent. A common ask for a barbell-first tracker: given a target weight, show which
plates to load per side.

**Owns:** a new plate module under `src/client/lib/`, its UI entry point in the
logger (post-decomposition: `logger/set-form.tsx`)
**Must not touch:** `pages/settings/` beyond adding a plate-inventory row if you
decide one is needed — coordinate with Lane A if it has not merged

---

## Check the premise first

**This is a feature nobody has asked for.** It was inferred from the app's shape,
not from user demand. Before building, sanity-check that it earns its place — an
unused feature in the logger costs attention on the one screen where attention is
scarcest. If in doubt, ask before implementing. It is the most deferrable item in
the backlog.

## If building it

Given a target weight, show the plates per side, working down from heaviest.

**Inputs you cannot hardcode:**

- **Bar weight.** 20kg / 45lb is typical, but not universal — women's bars are
  15kg, safety squat and trap bars differ, and a fixed barbell has no plates at all.
- **Available plates.** A home gym does not have the same set as a commercial one.
  This wants to be configurable, which means a plate inventory somewhere in
  Settings or Equipment.
- **Units.** kg and lb plate denominations are entirely different sets; do not
  convert one into the other and round.

## Watch for

- **Not every exercise uses a barbell.** Show it only where it applies — check the
  exercise's equipment. A plate calculator on a dumbbell curl is noise.
- **Unreachable targets.** With the available plates, some weights cannot be made.
  Say so and offer the nearest achievable, rather than rounding silently.
- **Where it lives.** The logger is already dense. Prefer a tap-to-reveal from the
  weight field over permanent chrome.
- Existing `src/shared/equipment.ts` and the equipment pages may already model
  enough to know whether an exercise is barbell-based. Read before adding.

## Acceptance

- Given target, bar and available plates, produces a correct per-side breakdown.
- Handles unreachable targets explicitly.
- Only appears for exercises where it makes sense.
- kg and lb each use their real denominations.
- The maths is pure and unit-tested, including unreachable targets, an empty plate
  set, and a target below bar weight.
