# Raw Idea: Workout History

## Source: PRD §"Workout history" + PRODUCT-PLAN references

A dedicated history surface that lists every logged session (both routine-driven
and freeform) in a dense, scannable layout, plus cross-cutting aggregation tiles
summarizing lifetime training output.

## Scope

- **History list page**: chronological list of all logged sessions (routine and
  freeform). Dense layout — see `/home/mike/Development/Forge/design/history-list.png`
  as the authoritative reference for tile composition and list density.
- **Summary / aggregation tiles** at the top of the history surface:
  - Total weight lifted (lifetime, all sessions)
  - Total exercises completed
  - Total sets completed
  - Total sessions
  - Total time spent training
- **Per-session detail view**: the LIST surface entries link into per-session
  detail (detail view itself is partially covered in the workout-sessions spec;
  this slice owns the list entry point and OVERALL aggregations).
- **Filters** on the history list:
  - Date range
  - Source routine
  - Source program
  - Exercise (sessions that contained a given exercise)

## Out of scope

- Per-exercise history view (already specced in `specs/workout-sessions`)
- Goals, programs authoring, live logger
- Editing past sessions (read-only history surface for this slice)

## Data source

Reads from `sessions` and `session_set_logs` tables already defined in
`/home/mike/Development/Forge/specs/workout-sessions/planning/spec.md`.
No new tables expected; aggregations are derived queries.

## Goals (from PRODUCT-PLAN)

- Denser layout than the current per-session views
- Summary tiles surface lifetime totals at a glance
- History list mockup density is the visual target

## Visual reference

- `/home/mike/Development/Forge/design/history-list.png` — authoritative for
  aggregation tiles and dense list layout.
