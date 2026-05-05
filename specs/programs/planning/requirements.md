# Spec Requirements: Programs

## Initial Description

From `specs/programs/planning/raw-idea.md`: Allow the user to plan multi-week training programs, start one, and track per-day session state and overall progress. A program is a structured plan of weeks → days; each day points to a routine (or is a rest day). Sessions logged from a program-day hydrate into mutable live sessions (handled by the workout-sessions spec) and report state back to the program. Authoring affordances include copying a single week and repeating a pattern of weeks across the duration. Starting a program tracks per-day state (`not_started`, `active`, `completed`, `skipped`) and surfaces overall progress.

## Requirements Discussion

Per orchestrator instructions, no clarifying questions were asked this round. Defensible decisions for low-stakes details have been made and documented as explicit assumptions below. Conventions locked across the routines and workout-sessions specs are inherited here without re-litigation:

- Drizzle (`src/db`) + Zod (`src/shared`) + Hono (`src/server`) + Dexie (`src/client`) + generic `pending_writes` outbox.
- Client-supplied UUIDv4 at every level.
- Whole-document API for nested resources (no PATCH diffing of children).
- No auth gate in v1 (consistent deferral with exercises / routines / sessions).
- Mobile-first, dense UX matching `design/programs-list.png` and `design/program-detail.png`.
- Hard delete; mutable-in-place template editing; session snapshots (owned by workout-sessions) preserve historical truth.

### Existing Code to Reference

**Pattern templates (mirror exactly):**
- `specs/exercise-library/planning/spec.md` — outbox, error shape, `409 id_conflict`, list/detail/create page split.
- `specs/routines/planning/spec.md` — nested whole-document API + Drizzle parent/child cascade pattern (`routine_blocks` / `routine_items` / `routine_set_targets`); Dexie mirrors API shape, server stores normalized.
- `specs/workout-sessions/planning/spec.md` — already defines the program-day hydration contract: `sourceType='program_day'`, `sourceProgramId`, `sourceProgramWeekIndex`, `sourceProgramDayIndex`. Programs spec must produce data that matches this contract.

**Code paths to leverage:**
- `src/db/schema.ts` — Drizzle `sqliteTable` + `text` PK + `integer({ mode: 'timestamp_ms' })` conventions; `idx_<table>_<col>` index naming.
- `src/server/routes/api.ts` — extend with `programs.ts` and `program-runs.ts` Hono sub-routers.
- `src/shared/pending-write.ts` — extend `PendingEntityEnum` with `'program'` and `'program_run'`. No structural change.
- `src/client/db/forge-db.ts` — add `programs`, `programRuns`, `programRunDayStates` Dexie stores alongside existing.
- `src/client/sync/flusher.ts` + `reconcile.ts` — extend dispatch table only; no new flusher logic.
- `src/client/lib/theme.ts` + `src/client/styles.css` — reuse `--bg`, `--surface`, `--border`, `--accent`, `--accent-fg`, `--text`, `--text-muted`, `--text-subtle`, `--radius-card`.
- `src/client/app.tsx` — register `/programs`, `/programs/new`, `/programs/:id`, `/programs/:id/edit`.
- Routine picker primitive (the exercise-picker pattern from routine-builder) is a useful reference for the per-day routine picker.

## Visual Assets

### Files Provided

No files in `specs/programs/planning/visuals/`. The authoritative mockups live in the project-wide `design/` folder (consistent with how other specs reference design tokens):

- `design/programs-list.png` + `design/programs-list.json` — Programs list screen.
- `design/program-detail.png` + `design/program-detail.json` — Program detail (week grid / Schedule tab).

### Visual Insights

**`programs-list.png` (high-fidelity):**
- Top bar: hamburger, "PROGRAMS" title, `+` action.
- ACTIVE program card with amber left edge, "ACTIVE" tag, program name, `Week N of M · <subtitle>`, progress bar (% complete), 8 week dots (filled / half / empty), `VIEW PROGRAM ›` link.
- "OTHER PROGRAMS" section: outlined cards with name, `<weeks> weeks · <state>` (e.g., `completed 3 months ago`, `draft`, `never started`).
- Bottom muted "Browse templates" link (out of scope in v1 — templates not shipped; the link can route to an empty placeholder or be omitted).

**`program-detail.png` (high-fidelity):**
- Top bar: back, program name, kebab (Edit / Duplicate / End program — Duplicate deferred to future work; Edit + End present in v1).
- Summary strip: `<weeks> weeks · <subtitle> · Started <date>`, progress bar + `Week N of M` chip + `<percent>% COMPLETION`.
- Tab segment: **SCHEDULE** (only tab in v1; OVERVIEW and STATS deferred — render as disabled or hidden).
- Week grid: rows per week, 7 day cells across (Sun–Sat). States visualized: completed (green check), current (amber outline), skipped (muted dash with strike), upcoming (outlined), routine label pill on filled days, muted dash on rest days. CURRENT PERIOD week gets a highlighted card with `PROGRESSING` chip.
- Footer actions: `COPY WEEK PATTERN` (outlined) and `EDIT PROGRAM` (amber primary).

**Fidelity:** high-fidelity mockups; layout and density are authoritative.

## Requirements Summary

### Functional Requirements

**Authoring (template layer):**
- Create / edit / delete programs with `name` (1–100), optional `description` (max 2000), `durationWeeks` (1–52).
- Fixed 7 days per week (Sunday=0 … Saturday=6). Each day is one of:
  - A reference to a routine (`routineId` set), OR
  - A rest day (`routineId` null AND `isRestDay=true`), OR
  - Unfilled (`routineId` null AND `isRestDay=false`).
- Builder affordances:
  - List page (`/programs`) — active card on top, other-programs list below.
  - Create / edit pages (`/programs/new`, `/programs/:id/edit`) — full-page form with week-grid editor.
  - Detail page (`/programs/:id`) — Schedule tab week grid; surfaces run progress when active.
  - **Duplicate week:** "Duplicate week N to weeks X–Y" affordance copies all 7 day assignments.
  - **Repeat pattern:** "Repeat weeks 1–N across remaining duration" affordance tiles a multi-week pattern across the program; trailing partial fill is allowed (truncates to fit remaining weeks).
  - Per-day routine picker (modal/sheet) reads from Dexie `routines`, name-substring search.

**Run / progress (execution layer):**
- One **active** program run per program at any time (enforced client- and server-side; `409 active_run_exists` on attempt).
- Multiple programs may each have their own run, but exactly one program may be the **globally active** program for the homepage / workout-start "From your program" surface in v1 — enforced as "at most one `program_runs` row with `status='active'` globally."
- Starting a program creates a `program_runs` row with `status='active'`, `startedAt`, cursor `currentWeekIndex=0`, `currentDayIndex=<today's weekday or first non-rest day>` (see assumption A4).
- A `program_run_day_states` row materializes lazily — created the first time a day is touched (started, skipped, completed). A missing row implies `not_started`.
- Day-state transitions:
  - `not_started → active`: when a session is created from this day (workout-sessions writes `sourceType='program_day'` + indexes; programs spec listens / reconciles by joining `sessions` on `(sourceProgramId, sourceProgramWeekIndex, sourceProgramDayIndex)`).
  - `active → completed`: automatically when the linked session's `status='finished'`.
  - `not_started | active → skipped`: explicit user action only (long-press / overflow on day cell → "Skip day").
  - Rest days are immutable from a run perspective (cannot be started, cannot be skipped).
- Cursor advancement: **flexible/sequential** in v1. The cursor points to the next `not_started` non-rest day in `(weekIndex, dayIndex)` order. The user may also tap any day to start it directly (jumps the cursor to that day on next render).
- Run completion: when every non-rest day reaches `completed` or `skipped`, run auto-transitions to `status='completed'` and `endedAt` is stamped.
- Run abandonment: explicit user "End program" action (kebab on detail page) sets `status='abandoned'` and `endedAt`. A new run can then be started for the same program.

**Integration with workout-sessions:**
- Programs spec does NOT own session creation; it produces the program-day reference that workout-sessions consumes. The `/workout/start` page's "From your program" card calls into workout-sessions' `POST /api/v1/sessions` with `sourceType='program_day'`, `sourceProgramId`, `sourceProgramWeekIndex`, `sourceProgramDayIndex`, `templateSnapshot=<routine resolved at start>`.
- After the session finishes, the program reconciler updates the corresponding `program_run_day_states` row to `completed` and links the `sessionId`.
- Editing a routine that a program references does NOT propagate retroactively to past sessions (sessions snapshot at start). Editing the program's day-routine assignment also does not affect already-started/finished day states for that run; only `not_started` days reflect the new assignment on next start.

**API:**
- `GET /api/v1/programs` → `200 { programs: Program[] }` — full list with nested days.
- `GET /api/v1/programs/:id` → `200 Program` | `404`.
- `POST /api/v1/programs` — body: full nested document with client `id`. `201` | `400` | `409 id_conflict`.
- `PATCH /api/v1/programs/:id` — body: full nested document. Server replaces program + child `program_days` transactionally. `200` | `400` | `404`.
- `DELETE /api/v1/programs/:id` → `204`. Cascades to `program_days`, `program_runs`, `program_run_day_states` via FK ON DELETE CASCADE. Idempotent.
- `GET /api/v1/program-runs` → `200 { runs: ProgramRun[] }` (full list, with nested day states).
- `GET /api/v1/program-runs/:id` → `200 ProgramRun` | `404`.
- `POST /api/v1/program-runs` — body: `{ id, programId, startedAt }`. Server enforces "no other active run for this program" and "no other globally-active run" (both return `409 active_run_exists`). `201` | `400` | `409`.
- `PATCH /api/v1/program-runs/:id` — body: full document (status / cursor / day states). `200` | `400` | `404`.
- `DELETE /api/v1/program-runs/:id` → `204`. Cascades to `program_run_day_states`. Idempotent.
- Error shape consistent: `{ error, issues?, id? }`.

**UI pages:**
- `/programs` — list (active card prominent + other-programs list).
- `/programs/new`, `/programs/:id/edit` — create/edit form with week-grid editor; per-day routine picker; duplicate-week + repeat-pattern affordances.
- `/programs/:id` — detail with Schedule tab week grid; START / RESUME / EDIT actions; long-press / overflow on day cell to Skip / Unskip / Jump-to.
- "From your program" card on the workout-start page (owned cosmetically by workout-sessions, but reads program data here).

**Validation (Zod):**
- `name`: trimmed, 1–100.
- `description`: optional, max 2000.
- `durationWeeks`: integer, 1–52.
- `program_days[]`: dense `(weekIndex, dayIndex)` over `[0..durationWeeks-1] × [0..6]`. Server normalizes; missing rows treated as `unfilled`.
- `routineId`: UUID; soft-checked client-side against Dexie `routines`; server-side soft (logs warning, accepts) — same convention as routines→exercises and exercises→equipment.
- `isRestDay`: boolean. Mutually exclusive with `routineId` (validated by `superRefine`).
- Run `status`: `'active' | 'completed' | 'abandoned'`.
- Day-state `status`: `'not_started' | 'active' | 'completed' | 'skipped'`.
- `currentWeekIndex` / `currentDayIndex`: integers within bounds of the program's `durationWeeks` and `[0..6]`.

### Reusability Opportunities

- Outbox / flusher / reconciler: identical pattern to routines & sessions; only entity dispatch grows (`'program'`, `'program_run'`).
- Whole-document PATCH replace: same transactional child-replace strategy as `routines`.
- Routine picker (modal/sheet): lift the exercise-picker pattern; v1 needs name-substring search only.
- List page primitives (top bar, dense rows, empty / loading / no-match states): clone exercise-library list page conventions.
- Active-program surface card on the home/today page (already noted in PRODUCT-PLAN.md as "single primary active-program / today card") — programs spec exposes the data; the home redesign is out of scope here.

### Scope Boundaries

**In Scope:**
- Programs CRUD (template layer): name, description, durationWeeks, week-grid of 7-day weeks with per-day routine reference or rest-day flag.
- Program runs (execution layer): start, track per-day state (`not_started | active | completed | skipped`), cursor advancement, auto-complete on session finish, explicit skip, explicit end-program.
- Single globally-active run + single active run per program (both enforced).
- Duplicate-week and repeat-week-pattern authoring affordances.
- Schedule tab on the detail page; week grid matching `design/program-detail.png`.
- Programs list page matching `design/programs-list.png` (active card + other programs).
- Wiring contract for workout-sessions' `/workout/start` "From your program" card and the program-day session hydration path already specced.
- API parity with the rest of v1 (`/api/v1/programs`, `/api/v1/program-runs`).

**Out of Scope:**
- Live session execution (owned by `specs/workout-sessions`).
- Embedded session templates per program day — v1 supports a routine reference OR rest day OR unfilled only. (Inline session templates deferred; can be added without schema change by allowing a nested template payload on `program_days` later.)
- Calendar-anchored scheduling and prescribed-rest-day weekly templates beyond the simple `isRestDay` flag.
- Variable day count per week (e.g., 5-day weeks); fixed 7 days/week in v1.
- "OVERVIEW" and "STATS" tabs from the detail mockup — only "SCHEDULE" tab ships in v1.
- Browse-templates / curated program library; no seed programs ship in v1.
- Program duplication action (kebab "Duplicate") — deferred. "Edit" and "End program" only in v1.
- Goals (including program-type goals).
- History aggregations / analytics over programs (per-program completion rate, streaks, calendar heatmaps).
- Bearer-token auth (consistent deferral).
- Bulk import/export and bulk API endpoints.
- Snapshot-on-start of program structure: edits to a program's day-routine assignments take effect for `not_started` days in the active run; we do NOT freeze the entire program structure at run start. (Rationale: simpler; sessions already snapshot the routine at session start, so historical truth is preserved at the session layer.)
- Multiple concurrent globally-active programs (intentionally one).

### Technical Considerations

**Storage (Drizzle, server-side):**
- `programs` — `id` (UUID PK), `name`, `description` (nullable), `durationWeeks`, `createdAt`, `updatedAt`. Indexes: `idx_programs_name`, `idx_programs_updated_at`.
- `program_days` — `id` (UUID PK), `programId` FK ON DELETE CASCADE, `weekIndex` (0-based, 0..durationWeeks-1), `dayIndex` (0-based, 0–6 Sun–Sat), `routineId` (UUID, nullable, soft FK), `isRestDay` (boolean), `notes` (nullable). Indexes: `idx_program_days_program_week_day` UNIQUE on `(programId, weekIndex, dayIndex)`, `idx_program_days_routine` on `routineId`.
- `program_runs` — `id` (UUID PK), `programId` FK ON DELETE CASCADE, `startedAt`, `endedAt` (nullable), `currentWeekIndex`, `currentDayIndex`, `status` (`'active' | 'completed' | 'abandoned'`), `createdAt`, `updatedAt`. Indexes: `idx_program_runs_program` on `programId`, `idx_program_runs_status` on `status`. Partial-unique guard: at most one row globally with `status='active'`; at most one row per `programId` with `status='active'`.
- `program_run_day_states` — `id` (UUID PK), `programRunId` FK ON DELETE CASCADE, `weekIndex`, `dayIndex`, `status` (`'not_started' | 'active' | 'completed' | 'skipped'`), `sessionId` (UUID, nullable, soft FK to `sessions.id`), `updatedAt`. Indexes: `idx_prds_run_week_day` UNIQUE on `(programRunId, weekIndex, dayIndex)`, `idx_prds_session` on `sessionId`.
- `pending_writes` reused unchanged; `entity ∈ {'program', 'program_run'}` added to enum.

**Dexie mirrors (client):**
- `programs` — keyPath `id`; full nested document `{ id, name, description, durationWeeks, days: [{ weekIndex, dayIndex, routineId, isRestDay, notes }], createdAt, updatedAt }`. Indexes: `name`, `updatedAt`.
- `programRuns` — keyPath `id`; full nested document including `dayStates: [{ weekIndex, dayIndex, status, sessionId }]`. Indexes: `programId`, `status`, `startedAt`.
- (Optionally fold day states into the `programRuns` document; we will, mirroring how routines fold blocks/items into one Dexie row.)

**Reconciliation hooks:**
- A small reconciler runs after sessions reconcile: for any session with `sourceType='program_day'` and `status='finished'`, ensure the matching `program_run_day_states` row is `status='completed'` and `sessionId` is set. For any in-progress program-day session, mark `status='active'`. Idempotent; runs on app load + after session writes.
- Cursor recompute: a derived helper (no persistence) computes the next `not_started` non-rest day for any active run. The persisted `currentWeekIndex` / `currentDayIndex` is a hint cached for cheap reads; the helper is the source of truth.

**Mobile-first dense UX:**
- Week grid uses a 7-cell row per week, day cells small enough that a full week is visible without horizontal scroll on a 360px viewport.
- Rest days render as a muted dash; unfilled days as an outlined empty cell; routine-day shows truncated routine name (e.g., "UA" / "LA" / "UB" abbreviation if a short alias exists, otherwise first 2–3 chars of routine name).
- Active day has an amber outline; completed day shows green check overlay; skipped day shows muted dash with strike.
- Long-press / overflow on a day cell exposes: "Start workout" (when not_started), "Resume" (when active), "Skip day", "Unskip", "Replace routine" (only in edit mode).

### Explicit Assumptions (defensible defaults)

- **A1 — Fixed 7-day week.** Day count per week is fixed at 7 (Sun=0 … Sat=6). User-defined day counts deferred. Rationale: matches the mockup, simpler schema, easier UX, and the `isRestDay` flag covers off-days adequately for v1.
- **A2 — Single globally-active program.** Enforced at the server (partial-unique on `program_runs.status='active'` globally) and client. Rationale: the mockup's homepage / workout-start "From your program" card assumes one active program; multi-active is a richer scope.
- **A3 — Single active run per program.** Same enforcement. A program may have prior `completed` or `abandoned` runs in history (read-only); only one current run.
- **A4 — Run cursor at start.** On `POST /api/v1/program-runs`, `currentWeekIndex=0` and `currentDayIndex=0`. Day 0 (Sunday) may be a rest day; the derived "next playable day" helper handles that (cursor advances past rest days when computing the next start). The persisted cursor is informational; UI uses the helper.
- **A5 — Mutable program structure during a run.** Edits to a program's day assignments propagate to `not_started` days in the active run on next render. `active`, `completed`, and `skipped` day states are unaffected. No snapshot of program structure at run start. Rationale: sessions already snapshot the routine at session start (workout-sessions spec), preserving historical truth where it matters; freezing the program adds complexity without protecting any history that isn't already protected.
- **A6 — Auto-complete only via session finish.** `program_run_day_states.status='completed'` is set ONLY when a linked session reaches `status='finished'`. Manual "Mark complete" is not exposed in v1 (skipping is the explicit alternative).
- **A7 — Skip is reversible.** "Unskip" returns a day to `not_started`. Once `completed` (i.e., a finished session exists), the day cannot be reverted; deleting the session would naturally revert it but session deletion is itself out of scope post-finish.
- **A8 — Repeat-pattern semantics on imperfect division.** `Repeat weeks 1–N across <duration>` tiles the pattern; if `(duration - sourceEnd)` is not a multiple of `N`, the trailing weeks copy the prefix of the pattern that fits. Existing assignments in target weeks are overwritten (with a confirm dialog). User can undo via Cancel / discard before save.
- **A9 — Duplicate-week semantics.** `Duplicate week N to weeks X–Y` overwrites all 7 day assignments in the destination range with copies of week N. Confirm dialog if any destination week has existing assignments.
- **A10 — `program_days` materialization.** Server stores a row per `(weekIndex, dayIndex)` only when the day is non-default (has a `routineId`, `isRestDay=true`, or `notes`). Missing rows are treated as `unfilled`. Dexie/UI hydrate the full grid client-side from `durationWeeks` × 7 with `program_days` overlaid. (Alternative: store all rows densely. Sparse storage chosen to keep payloads compact; the API still returns the sparse list and the client expands.)
- **A11 — `program_run_day_states` materialization.** Lazy: rows created only when a day is touched. Missing row = `not_started`.
- **A12 — Schedule tab only.** Detail page renders only the SCHEDULE tab in v1; OVERVIEW and STATS tabs are hidden (not disabled — keep the UI clean). They are reserved for a future analytics slice.
- **A13 — No program seed/templates.** "Browse templates" link in the mockup is dropped from v1 (or routes to an empty "Coming soon" state). No seed programs ship.
- **A14 — Day cell label.** Routine label inside a day cell uses the routine's `name` truncated to ~3 chars; if the routine has a future "shortLabel" field it would win, but v1 just truncates `name`. Tap target shows full routine name in a tooltip / sheet.
- **A15 — Program editing of an in-progress run is allowed.** No "discard run to edit" prompt; edits apply per A5. EDIT PROGRAM button on detail page navigates to `/programs/:id/edit`.
- **A16 — End program.** Kebab "End program" sets the active run's `status='abandoned'` with confirm dialog. Day states are preserved as historical record; a new run can be started afterward.
- **A17 — Outbox payloads.** Programs use full-nested-document payloads on create/update (matching routines convention). Program runs use full-document payloads including the nested `dayStates` array. Day-state changes during a run are issued as full-run PATCHes (one outbox entry per change), keeping the flusher dispatch table simple.
- **A18 — Soft FK to `routines.id` and `sessions.id`.** No DB-level cascade from those tables into program data; if a routine is deleted, referencing program days render a "Missing routine — Replace" placeholder (mirrors routines' handling of deleted exercises). If a session is deleted, the day-state's `sessionId` is nulled lazily on next reconcile.
