# Spec Buildout Handoff

_Last updated: 2026-05-05_

Working through the missing PRD slices, building out specs in dependency order. Each spec follows the same pattern as `specs/exercise-library/`: `planning/raw-idea.md` → `planning/requirements.md` → `planning/spec.md` → `planning/tasks.md`, with empty `implementation/`.

## Status

| # | Spec | Folder | Status |
|---|---|---|---|
| 1 | Routines (template layer) | `specs/routines/` | ✅ Complete |
| 2 | Workout sessions / logger | `specs/workout-sessions/` | ✅ Complete |
| 3 | Programs | `specs/programs/` | ✅ Complete |
| 4 | Workout history | `specs/workout-history/` | ✅ Complete (raw-idea + requirements + spec + tasks) |
| 5 | Goals | `specs/goals/` | ✅ Complete (raw-idea + requirements + spec + tasks) |
| 6 | Export & API surface | `specs/export/` | ✅ Complete (raw-idea + requirements + spec + tasks) |
| 7 | Today / homepage surface | `specs/home/` | ✅ Complete (raw-idea + requirements + spec + tasks) |

## Resume here

Implementation in progress. Status:
- exercise-library: Phases 1–10 complete; Phase 11 (manual verification) is the only remaining item.
- routines: Phase 1 (shared Zod schemas) complete — `src/shared/routine.ts` added, `pending-write.ts` entity union extended with `'routine'`, barrel re-exports wired. Typecheck clean. Phases 2–10 (Drizzle schema, Hono routes, Dexie + outbox, list page, builder shell, drag/drop, prescription editor, polish, manual verification) are next.

Suggested implementation order, mirroring dependency direction:

1. exercise-library (Phases 1–10 done; Phase 11 manual verification pending)
2. routines (Phase 1 done; Phases 2–10 pending)
3. workout-sessions
4. workout-history
5. programs
6. goals
7. export
8. home/today

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
- **Set log slot binding**: tight (`plannedSetId` FK), but flexible — orphaned logs from removed planned slots become extras (never auto-deleted).
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

> All seven PRD specs in `/home/mike/Development/Forge/specs/` are complete (raw-idea + requirements + spec + tasks each). Read `specs/HANDOFF.md` for the full status. Begin implementation per each spec's `tasks.md`, in dependency order: exercise-library → routines → workout-sessions → workout-history → programs → goals → export → home. The exercise-library implementation is already partway through its Phase 10 polish — pick up there first.
