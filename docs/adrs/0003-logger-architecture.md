# 0003 — Logger architecture

**Status:** accepted · **Date:** 2026-04-23

## Context

The workout logger is the highest-stakes surface — it's used mid-set with one hand, needs to handle any prescription shape (single exercises, supersets of 2 or N exercises, straight sets, AMRAPs, drop sets), and must remain useful offline. Earlier iterations with inline per-row editing didn't scale past a handful of sets.

## Decision

Set list is read-only and scannable. Editing happens in a sticky **input dock** above the primary action button. Superset navigation uses swipe + position dots, not tab switchers. The kebab menu owns all structural actions (end workout, swap exercise, reorder, etc.) so the top bar stays quiet.

## Specifics

- **Top bar:** position indicator `N of M` centered, kebab right. No End button.
- **Exercise header:** title, tiny "SUPERSET X" label + N position dots (tappable, swipeable area), "last time" muted line, prescription chip row
- **Set list:** compact read-only rows (set #, weight × reps, RPE, status). Tap to load into dock. Current set has a thin amber left bar.
- **Bottom stack (top → bottom):**
  1. **Rest timer strip** — one line, play/pause toggle, tabular countdown (tap to edit), thin amber progress bar under the line. Auto-starts on Log Set (configurable).
  2. **Input dock** — big ± steppers for weight and reps; RPE and Note as small optional chips
  3. **Log Set button** — amber, full width
- **Kebab menu:** End workout, Swap exercise, Add exercise, Reorder, Edit prescription, Remove

## Rationale

- Separating edit surface from list surface scales to arbitrary set counts without squeezing the list
- Dots + swipe gracefully handle 2-exercise or N-exercise supersets (tabs with ellipsis don't)
- Hiding End behind kebab reduces misclicks mid-workout
- Read-only list is faster to render and easier to scroll with a sweaty thumb

## Consequences

- Editing a past set requires tapping it to load it into the dock — extra tap compared to inline editing, but still fast
- Need a swipe gesture layer on the exercise area without eating vertical scrolls — use horizontal-only detection
- The input dock is a single source of truth for "current set" state; list rows are a projection
