# Spec Buildout Handoff

_Last updated: 2026-05-22_

Working through the missing PRD slices, building out specs in dependency order. Each spec follows the same pattern as `specs/exercise-library/`: `planning/raw-idea.md` → `planning/requirements.md` → `planning/spec.md` → `planning/tasks.md`, with empty `implementation/`.

## Status

| # | Spec | Folder | Status |
|---|---|---|---|
| 1 | Routines (template layer) | `specs/routines/` | ✅ Complete |
| 2 | Workout sessions / logger | `specs/workout-sessions/` | ✅ Spec + implementation substantially complete (see gaps below) |
| 3 | Programs | `specs/programs/` | ✅ Spec complete; implementation not started |
| 4 | Workout history | `specs/workout-history/` | ✅ Spec complete; list page + filters implemented |
| 5 | Goals | `specs/goals/` | ✅ Spec complete; implementation not started |
| 6 | Export & API surface | `specs/export/` | ✅ Spec complete; implementation not started |
| 7 | Today / homepage surface | `specs/home/` | ✅ Spec complete; implementation not started |

## Resume here

**workout-sessions is substantially complete.** All core flows work: start (routine + freeform), live logger with cursor, rest timer, structural edits, finish, post-finish detail, exercise history wiring. 52 tests passing.

### Known gaps in workout-sessions (in priority order)

1. **Skip set (9.2)** — no Skip button in UI; `status='skipped'` mutation exists but not wired
2. **ADD SET wiring (9.4)** — "ADD SET" button in ExerciseCard not wired; extra set (plannedSetId=null, status='extra') flow not surfaced
3. **RPE input (9.7)** — RPE field on log schema and DB, but no stepper in the inline editor
4. **Radix confirm dialog (10.1)** — Finish workout uses `window.confirm` instead of a proper dialog
5. **Post-finish superset/cardio blocks (10.5)** — superset accent bars, cardio row format, previous-attempt section not rendered
6. **Partial-unique DB index (1.3)** — missing from migration SQL; server enforces at runtime as fallback
7. **Pause and leave (7.2)** — overflow item not implemented; navigating back just leaves the session in-progress
8. **Full conflict dialog (6.6)** — resume banner exists; full Radix intercept for a second start attempt missing
9. **Phase 12 polish** — validation surfaces, error toasts, a11y sweep, outbox ordering

### What workout-history has

- `/history` route with filter chips (All / Week / Month / Year)
- Date-grouped session list with PR pill
- `listFinishedSessions` query with range/exercise/routine/text filters
- 3 tests in `src/client/pages/history/__tests__/history.test.ts`

### Suggested next steps (dependency order)

1. Finish remaining workout-sessions gaps (list above), then Phase 12 polish
2. Programs spec implementation
3. Goals spec implementation
4. Export spec implementation
5. Home/today spec implementation

## Key locked conventions (apply across all remaining specs)

- Drizzle + Zod shared + Hono + Dexie + `pending_writes` outbox pattern (per `specs/exercise-library/`).
- Client-supplied UUIDs; server returns 409 on collision.
- Whole-document API (no sub-resources except where noted: workout-sessions has `/sessions/:id/logs/:logId`).
- **No auth in v1** (single user, local) — explicit divergence from PRD's "bearer token" requirement, documented as assumption.
- Hard delete; mutable in place; sessions snapshot routines so history is preserved.
- Mobile-first dense UX with progressive disclosure.
- Match `specs/exercise-library/planning/` format/depth for every spec.

## Cross-spec references (already locked, don't relitigate)

- Routines (`specs/routines/planning/spec.md`) defines the template prescription model; sessions hydrate from this snapshot.
- Workout-sessions (`specs/workout-sessions/planning/spec.md`) defines `sessions` and `session_set_logs`; workout-history reads from these, no new tables. Workout-sessions exports an `epley()` helper reused by goals.
- Programs (`specs/programs/planning/spec.md`) defines `programs`, `program_days`, `program_runs`, `program_run_day_states`; integrates with workout-sessions via `sourceType='program_day'` + week/day indexes. Goals reuse `program_runs` for `program`-category progress.
- History (`specs/workout-history/planning/spec.md`) is read-only over sessions + session_set_logs.
- Goals (`specs/goals/planning/spec.md`) introduces one new table (`goals`) and one outbox discriminator (`'goal'`); reuses `pending_writes` and the post-finish reconcile hook on workout-sessions to recompute derived progress and auto-flip `status`.

## Notable design decisions (already locked, don't relitigate)

- **Session storage**: Option B (snapshot+live as JSON on session row; `session_set_logs` normalized & indexed).
- **Set log slot binding**: tight (`plannedSetId` FK), but flexible — orphaned logs from removed planned slots become extras (never auto-deleted). Slot canonical identifier field is `id` (not `plannedSetId`) in liveStructure JSON; `log.plannedSetId` references `slot.id`.
- **Mid-session edits**: full scope including superset structure mutation. "Add set inside superset = add a round."
- **Lifecycle**: one in-progress session at a time; strict immutability after finish.
- **Rest timer**: persisted on session row, cleared on finish.
- **1RM**: Epley, computed on read.
- **Programs**: 7-day weeks fixed, single globally-active run, flexible/sequential scheduling only.
- **Routines prescription**: per-set `setType` enum; independent uniform/custom modes for repMode/rpeMode/setTypeMode.
- **History**: read-only view layer, computed on read (no aggregation tables), kg-hardcoded display in v1.
- **Goals**: derived-on-read for `strength | cardio | program`; manual `currentValue` for `weight | measurement | other`. Per-category required/forbidden field matrix enforced via Zod `superRefine`. Reconcile fan-out only on session finish; retro log edits do not auto-flip status (documented limitation).

## Authoritative visuals in `design/`

- `routine-builder.png` (routines)
- `logger-dark.png`, `logger-light.png`, `workout-start.png`, `history-detail.png`, `exercise-detail.png` (workout-sessions)
- `programs-list.png`, `program-detail.png` (programs)
- `history-list.png` (workout-history)
- `goals-list.png`, `goal-form.png` (goals)
- `home.png` (home/today — to use)
- No mockups for export

## Resume prompt to paste in new context

> The Forge app has exercise-library, routines, and workout-sessions substantially implemented. Workout-history has a list page. Read `specs/HANDOFF.md` for full status. The workout-sessions tasks.md lists remaining gaps in priority order — start there, then proceed to Programs → Goals → Export → Home in dependency order. 52 tests passing (bun run test from src/client). Typecheck clean (bun run typecheck from root).
