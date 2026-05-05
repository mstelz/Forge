# Programs — Raw Idea

Source: extracted from `docs/PRD.md` and `docs/PRODUCT-PLAN.md`. This is the unrefined idea capture; requirements/spec come later.

## Goal

Allow the user to plan multi-week training programs, start one, and track per-day session state and overall progress. A program is a structured plan of weeks → days, where each day points to a routine (or embedded session template). Sessions logged from a program-day hydrate into mutable live sessions (handled in the workout-sessions spec) and report state back to the program.

## Source excerpts

### From `docs/PRD.md`

Product goals / key features:

- "Combine routines into multi-week programs"
- "wants custom routines and programs"

Program planning section:

- Build a program as weeks containing planned training days.
- Program name, description, duration (in weeks).
- Ability to copy a previous week or pattern of weeks — e.g. weeks 1 and 2 repeated for a total duration of 12 weeks.
- Assign a routine or session template to each day.
- Start a program and track completed, skipped, and upcoming sessions.

Functional requirements — Section 4. Program model:

- A program contains weeks.
- Each week contains planned training days.
- Each training day points to a routine or embedded session template.
- Program progress must track `not_started`, `active`, `completed`, and `skipped` states at the session level.

Related (workout logging):

- "Start a workout from a routine, a freeform session, or part of an already joined program."

API:

- "CRUD exercises, goals, routines, and programs via `/api/v1`."

### From `docs/PRODUCT-PLAN.md`

- multi-week programs are part of the v1 scope.
- `src/components/program-builder.tsx` — programs list/create flow.
- Programs UI direction:
  - `/programs` = list-first page
  - `/programs/new` = dedicated create/edit page
  - Programs should use split list/create pages.
- Starting from a routine/program should hydrate a mutable live session.
- Workouts can be started from a program.
- "programs split list/create direction" — phase 1 direction.
- Phase 3 / future polish:
  - better Today page / live status clarity
  - richer program progress views
  - progressive detail reveal across list-heavy areas
  - define how a routine/program hydrates into a session snapshot
  - polish Today / next workout surfaces around active session state
- Open / deferred items relevant to programs:
  - Redesign homepage overview to use a single primary active-program / today card (remove duplicate secondary active-program card).
  - Replace calendar day links with a quick day detail surface (popover, drawer, or slide-up) that shows the planned or completed workout/routine for that day.
  - Evaluate whether the dedicated Today page should be collapsed into the homepage overview once resume/start state is fully surfaced.
  - "document a future scheduling mode feature: programs may eventually support both flexible/sequential execution and calendar-anchored scheduling with prescribed rest days."

## In-scope (this spec)

- Program entity: name, description, duration in weeks.
- Weeks containing planned training days.
- Each day points to a routine, or carries an embedded session template.
- Authoring affordances:
  - Add/edit/remove weeks and days.
  - Copy a single week.
  - Copy a pattern of weeks across the program duration (e.g. repeat weeks 1–2 across 12 weeks).
- Starting a program:
  - Tracks per-day session state: `not_started`, `active`, `completed`, `skipped`.
  - Surfaces overall program progress.
- Integration points:
  - Days reference routines from the routines spec
    (`/home/mike/Development/Forge/specs/routines/planning/spec.md`).
  - Sessions hydrate from a program-day with `sourceType='program_day'` and week/day indexes per the workout-sessions spec
    (`/home/mike/Development/Forge/specs/workout-sessions/planning/spec.md`).
- API: CRUD for programs under `/api/v1`.

## Deferred / out-of-scope (note, but design must not preclude)

- Scheduling mode: flexible/sequential vs calendar-anchored with prescribed rest days. Data model and progress tracking should leave room for a future calendar-anchored mode without rework.
- Live session execution mechanics — owned by the workout-sessions spec.
- Goals (including program-type goals) — separate spec.
- History aggregations and analytics over programs.
- Calendar day detail surface UX, Today-page consolidation, homepage overview redesign — tracked in product plan, not this spec.

## Open questions (to resolve in requirements)

- Embedded session template vs. always-a-routine: do we support embedded templates in v1, or require a routine reference?
- How is "active program" represented — single active program, or multiple?
- What does "active" day-state mean precisely (session in progress vs scheduled-for-today)?
- Skipping behavior: user-initiated only, or auto-skip on advance?
- Editing a program after it has been started — allowed, restricted, or snapshot-on-start?
- Pattern-copy semantics when total weeks isn't a clean multiple of the pattern length.
