# Specification: Programs (Plan Layer)

## Overview

This slice introduces the **multi-week program planning + run-tracking layer** to Forge. A program is a named template of `durationWeeks` weeks × 7 fixed days (Sun=0 … Sat=6), where each day either references a routine, is flagged a rest day, or is unfilled. A program **run** is the execution shell: starting a program creates one `program_runs` row that tracks per-day state (`not_started | active | completed | skipped`) as the user works through the plan. Sessions are NOT owned here — workout-sessions hydrate from a program-day reference and report state back via a reconciler.

This is the third feature built on the foundation laid by exercise-library and routines, and the consumer of the program-day hydration contract already specified in workout-sessions. It mirrors those slices exactly: Drizzle in `src/db`, Zod in `src/shared`, Hono in `src/server`, Dexie + generic `pending_writes` outbox in `src/client`. No new flusher logic — only new entity discriminators (`'program'`, `'program_run'`). The list and detail UIs match `design/programs-list.png` and `design/program-detail.png` in layout and density.

## Goals

- Let the single user create, browse, edit, and delete multi-week programs fully offline.
- Provide builder affordances for **duplicate-week** and **repeat-week-pattern** so 12-week plans don't require 12× manual entry.
- Track one **active** program run per program (and at most one globally-active run) with per-day state derived lazily as days are touched.
- Auto-complete a program-day when its hydrated session finishes; allow explicit skip and explicit end-program.
- Match `design/programs-list.png` (active card + other-programs list) and `design/program-detail.png` (Schedule tab, week grid, day-state pills) in structure and density.
- Produce data that satisfies the existing program-day hydration contract owned by workout-sessions (`sourceType='program_day'`, `sourceProgramId`, `sourceProgramWeekIndex`, `sourceProgramDayIndex`).

## Non-goals (v1)

- Live session execution (owned by `specs/workout-sessions`).
- Embedded session templates per program day — v1 is routine-reference OR rest day OR unfilled only.
- Calendar-anchored scheduling and prescribed-rest-day weekly templates beyond the simple `isRestDay` flag.
- Variable day count per week — fixed 7 days/week.
- "OVERVIEW" and "STATS" tabs from the detail mockup — only the SCHEDULE tab ships.
- Browse-templates / curated program library / seed programs.
- Program duplication (kebab "Duplicate") — deferred. Edit + End program only in v1.
- Goals (including program-type goals) and history aggregations / analytics over programs.
- Bearer-token auth on `/api/v1/programs` and `/api/v1/program-runs` (consistent deferral).
- Bulk import/export and bulk API endpoints.
- Snapshot-on-start of program structure: edits to a program's day-routine assignments take effect for `not_started` days in an active run; sessions already snapshot the routine at session start.
- Multiple concurrent globally-active programs (intentionally one).

## User Stories

- As a self-directed lifter, I want to plan a 12-week program by laying out routines on a week × day grid and reusing weekly patterns, so authoring stays fast.
- As a lifter following a program, I want to see at a glance which day I'm on and how much of the program I've completed, so I stay accountable.
- As a returning user, I want to skip a missed day or end an abandoned program, so my run history reflects reality and I can start fresh.

## Specific Requirements

**Domain model — `programs` table (Drizzle, SQLite)**
- `id` text PK (UUID); `name` text not null; `description` text nullable.
- `durationWeeks` integer not null (1–52).
- `createdAt`, `updatedAt` integer (timestamp_ms) not null.
- Indexes: `idx_programs_name` on `name`, `idx_programs_updated_at` on `updatedAt`.

**Domain model — `program_days` table**
- `id` text PK (UUID); `programId` text not null FK → `programs.id` ON DELETE CASCADE.
- `weekIndex` integer not null (0-based, `0..durationWeeks-1`); `dayIndex` integer not null (0–6, Sun=0).
- `routineId` text nullable (soft FK to `routines.id`; no DB-level cascade — mirrors routines→exercises convention).
- `isRestDay` integer (boolean, 0/1) not null default 0.
- `notes` text nullable (max 1000 chars).
- Indexes: `idx_program_days_program_week_day` UNIQUE on `(programId, weekIndex, dayIndex)`; `idx_program_days_routine` on `routineId`.
- Sparse storage: a row exists only when the day has `routineId`, `isRestDay=true`, or `notes`. Missing rows = `unfilled`. Client expands to a dense 7×durationWeeks grid on render.

**Domain model — `program_runs` table**
- `id` text PK (UUID); `programId` text not null FK → `programs.id` ON DELETE CASCADE.
- `status` text not null (`'active' | 'completed' | 'abandoned'`).
- `startedAt` integer (timestamp_ms) not null; `endedAt` integer nullable.
- `currentWeekIndex` integer not null default 0; `currentDayIndex` integer not null default 0 (informational cursor — derived helper is source of truth).
- `createdAt`, `updatedAt` integer (timestamp_ms) not null.
- Indexes: `idx_program_runs_program` on `programId`; `idx_program_runs_status` on `status`. Partial-unique runtime guard: at most one row globally with `status='active'`; at most one per `programId` with `status='active'`.

**Domain model — `program_run_day_states` table**
- `id` text PK (UUID); `programRunId` text not null FK → `program_runs.id` ON DELETE CASCADE.
- `weekIndex` integer not null; `dayIndex` integer not null.
- `status` text not null (`'not_started' | 'active' | 'completed' | 'skipped'`).
- `sessionId` text nullable (soft FK to `sessions.id`; nulled lazily on next reconcile if session is deleted).
- `updatedAt` integer (timestamp_ms) not null.
- Indexes: `idx_prds_run_week_day` UNIQUE on `(programRunId, weekIndex, dayIndex)`; `idx_prds_session` on `sessionId`.
- Lazy materialization: rows created only when a day is touched (started, skipped, completed). Missing row = `not_started`.

**Zod shared schemas**
- New `src/shared/program.ts`: `ProgramDaySchema` (`{ id, weekIndex, dayIndex, routineId: uuid|null, isRestDay: boolean, notes?: string|null }`), `ProgramSchema` (`{ id, name: trim().min(1).max(100), description?: string.max(2000)|null, durationWeeks: int.min(1).max(52), days: ProgramDaySchema[], createdAt, updatedAt }`), `ProgramCreateInput`, `ProgramUpdateInput` (full nested document; no patch form).
- Cross-field rules (`.superRefine`): `(weekIndex, dayIndex)` pairs unique per program; `weekIndex ∈ [0, durationWeeks-1]`; `dayIndex ∈ [0, 6]`; `routineId` and `isRestDay=true` are mutually exclusive (a day cannot be both a routine day AND a rest day); `routineId` is soft-checked client-side against Dexie `routines`, server-side soft (logs warning, accepts) — same convention as routines→exercises.
- New `src/shared/program-run.ts`: `ProgramRunStatusEnum` (`'active' | 'completed' | 'abandoned'`), `ProgramRunDayStatusEnum` (`'not_started' | 'active' | 'completed' | 'skipped'`), `ProgramRunDayStateSchema` (`{ id, weekIndex, dayIndex, status, sessionId: uuid|null, updatedAt }`), `ProgramRunSchema` (`{ id, programId, status, startedAt, endedAt: number|null, currentWeekIndex, currentDayIndex, dayStates: ProgramRunDayStateSchema[], createdAt, updatedAt }`), `ProgramRunCreateInput` (`{ id, programId, startedAt }`), `ProgramRunUpdateInput` (full document).
- `src/shared/pending-write.ts` updated: `PendingEntityEnum` extended with `'program'` and `'program_run'`. No structural change to `PendingWriteSchema`.

**HTTP API — programs**
- All routes under `/api/v1/programs`. JSON in/out. No auth gate.
- `GET /api/v1/programs` → `200 { programs: Program[] }` (full list with nested `days`).
- `GET /api/v1/programs/:id` → `200 Program` | `404 { error: 'not_found' }`.
- `POST /api/v1/programs` — body: `ProgramCreateInput` (client `id`, nested `days[]`). `201 Program` | `400 validation` | `409 { error: 'id_conflict', id }`.
- `PATCH /api/v1/programs/:id` — body: `ProgramUpdateInput` (full nested document). Server transactionally deletes old `program_days` and re-inserts from payload (mirrors routines whole-document replace). `200 Program` | `404` | `400`.
- `DELETE /api/v1/programs/:id` → `204`. Cascades to `program_days`, `program_runs`, `program_run_day_states` via FK ON DELETE CASCADE. Idempotent.

**HTTP API — program runs (sub-resource)**
- All routes under `/api/v1/program-runs`.
- `GET /api/v1/program-runs` → `200 { runs: ProgramRun[] }` (full list with nested `dayStates`).
- `GET /api/v1/program-runs/:id` → `200 ProgramRun` | `404`.
- `POST /api/v1/program-runs` — body: `ProgramRunCreateInput`. Server enforces "no other active run for this `programId`" AND "no other globally-active run" — both return `409 { error: 'active_run_exists', id }`. Server stamps `status='active'`, `currentWeekIndex=0`, `currentDayIndex=0`. `201` | `400` | `409 id_conflict` | `409 active_run_exists`.
- `PATCH /api/v1/program-runs/:id` — body: `ProgramRunUpdateInput` (full document; mutates `status`, cursor, nested `dayStates[]`). Server replaces child rows transactionally. `200` | `404` | `400`.
- `DELETE /api/v1/program-runs/:id` → `204`. Cascades to `program_run_day_states`. Idempotent.
- Error shape consistent: `{ error, issues?, id? }`.

**Dexie mirror + outbox**
- Three new Dexie stores: `programs` (keyPath `id`; indexes on `name`, `updatedAt`) holding the full nested document `{ ..., days: [...] }`; `programRuns` (keyPath `id`; indexes on `programId`, `status`, `startedAt`) holding the full nested run document including `dayStates: []`; `programRunDayStates` is folded into the parent `programRuns` document (mirrors routines folding blocks/items into one row).
- Reads via Dexie wrapped in Tanstack Query, identical to routines/sessions. Writes always go to Dexie + `pendingWrites` in one transaction.
- Outbox extension: `entity='program'` for program create/update/delete (full nested document for create/update, `{ id }` for delete); `entity='program_run'` for run create/update/delete (full nested document for create/update including `dayStates`, `{ id }` for delete). Day-state changes during a run issue full-run PATCHes — one outbox entry per change keeps the flusher dispatch table simple.
- Reuse `src/client/sync/flusher.ts` and `reconcile.ts` unchanged — only the entity dispatch table grows. Reconcile pulls `GET /api/v1/programs` and `GET /api/v1/program-runs` with the same local-wins-while-pending merge rule used by routines.

**Run lifecycle and day-state transitions**
- One **active** program run per program (server-enforced). One **globally-active** run across all programs (server-enforced). Multiple historical `completed` / `abandoned` runs may coexist on the same program.
- Start: `POST /api/v1/program-runs` creates the row at `currentWeekIndex=0`, `currentDayIndex=0`. The persisted cursor is informational; UI uses a derived helper that computes the next `not_started` non-rest day in `(weekIndex, dayIndex)` order.
- `not_started → active`: when workout-sessions writes a session with `sourceType='program_day'` + matching `(sourceProgramId, sourceProgramWeekIndex, sourceProgramDayIndex)`. Reconciler joins on those keys and upserts the matching `program_run_day_states` row.
- `active → completed`: automatically when the linked session reaches `status='finished'`. Reconciler stamps `status='completed'` and `sessionId`.
- `not_started | active → skipped`: explicit user action only (long-press / overflow on day cell → "Skip day"). Skip is reversible to `not_started` ("Unskip"). Once `completed`, the day cannot be reverted manually.
- Rest days are immutable from a run perspective (cannot be started, cannot be skipped).
- Run auto-complete: when every non-rest day reaches `completed` or `skipped`, run transitions to `status='completed'` and `endedAt` is stamped.
- Run abandonment: explicit "End program" (kebab on detail page, confirm dialog) sets `status='abandoned'` and `endedAt`. A new run can then be started.

**Week copy and pattern repeat semantics (builder)**
- **Duplicate week:** "Duplicate week N to weeks X–Y" overwrites all 7 day assignments in the destination range with copies of week N. Confirm dialog when any destination week has existing assignments. Operates on the in-memory builder document; persisted only on Save.
- **Repeat pattern:** "Repeat weeks 1–N across remaining duration" tiles a multi-week pattern across the program. If `(durationWeeks - sourceEnd)` is not a multiple of `N`, the trailing weeks copy the prefix of the pattern that fits (truncates to fill remaining weeks). Existing assignments in target weeks are overwritten with a confirm dialog.
- Both affordances mint fresh `program_days[].id` UUIDs for every copied row to avoid PK collision in the persisted payload.

**Program-day → session hydration contract (integration with workout-sessions)**
- Programs spec does NOT own session creation. The `/workout/start` "From your program" card (cosmetically owned by workout-sessions) reads the active run's next playable day from this spec's Dexie data, then calls `POST /api/v1/sessions` with `sourceType='program_day'`, `sourceProgramId`, `sourceProgramWeekIndex`, `sourceProgramDayIndex`, and `templateSnapshot` resolved from the program-day's `routineId` at start.
- After session finish, the program reconciler updates the matching `program_run_day_states` row to `status='completed'` and links `sessionId`. Idempotent; runs on app load and after session writes.
- Editing a routine that a program references does NOT propagate retroactively — sessions snapshot at start. Editing the program's day assignment does not affect already-started/finished day states for the active run; only `not_started` days reflect the new assignment on next start.

**UI pages and states (mockup-faithful)**
- **`/programs` (list):** top bar (hamburger, "PROGRAMS", `+`); ACTIVE program card with amber left edge, "ACTIVE" tag, name, `Week N of M · <subtitle>`, progress bar (% complete), 8 week dots (filled / half / empty), `VIEW PROGRAM ›`. "OTHER PROGRAMS" outlined cards with name, `<weeks> weeks · <state>` (e.g., `completed 3 months ago`, `draft`, `never started`). Empty state when no programs. Bottom muted "Browse templates" link routes to an empty placeholder or is omitted (per A13).
- **`/programs/new`, `/programs/:id/edit` (builder):** top bar (back with discard-confirm if dirty, title, amber **Save**). Name + description fields, `durationWeeks` stepper. Week grid editor (rows per week, 7-day cells across, Sun–Sat); per-day picker opens a routine-picker modal/sheet (reads Dexie `routines`, name-substring search) with options to assign routine, mark rest day, clear, or add notes. **Duplicate-week** and **Repeat-pattern** affordances live in a top-of-grid action menu. Save commits Dexie write + outbox enqueue then routes back.
- **`/programs/:id` (detail):** top bar (back, program name, kebab with **Edit** and **End program**; **Duplicate** deferred). Summary strip: `<weeks> weeks · <subtitle> · Started <date>`, progress bar + `Week N of M` chip + `<percent>% COMPLETION`. Tab segment shows only **SCHEDULE** in v1 (OVERVIEW and STATS hidden). Week grid: rows per week, 7-day cells; states visualized as completed (green check), current (amber outline), skipped (muted dash with strike), upcoming (outlined), routine label pill on filled days, muted dash on rest days. CURRENT PERIOD week gets a highlighted card with `PROGRESSING` chip. Long-press / overflow on a day cell exposes "Start workout" (when not_started), "Resume" (active), "Skip day", "Unskip". Footer actions: `COPY WEEK PATTERN` (outlined) and `EDIT PROGRAM` (amber primary). 404 state for missing id.

**Validation rules (Zod, `src/shared/program.ts` + `program-run.ts`)**
- `name`: required, trimmed, 1–100.
- `description`: optional, max 2000.
- `durationWeeks`: integer, 1–52.
- `program_days[]`: `(weekIndex, dayIndex)` unique; `weekIndex ∈ [0, durationWeeks-1]`; `dayIndex ∈ [0, 6]`. Sparse list — server normalizes; missing rows = `unfilled`.
- `routineId`: UUID; mutually exclusive with `isRestDay=true`. Reference existence soft-checked client-side, soft on server.
- `notes`: optional, max 1000 chars.
- Run `status`: enum `'active' | 'completed' | 'abandoned'`. Day-state `status`: enum `'not_started' | 'active' | 'completed' | 'skipped'`.
- `currentWeekIndex` / `currentDayIndex`: integers within bounds of the program's `durationWeeks` and `[0, 6]`.
- `dayStates[]`: `(weekIndex, dayIndex)` unique per run; bounds-checked against the parent program's `durationWeeks`.

## Visual Design

**`design/programs-list.png`**
- Top bar: hamburger, "PROGRAMS" title, `+` action routing to `/programs/new`.
- ACTIVE program card with amber left edge, "ACTIVE" tag, program name, `Week N of M · <subtitle>` line.
- Progress bar with % completion; 8 week dots (filled / half / empty) summarizing run progress.
- `VIEW PROGRAM ›` link routes to `/programs/:id`.
- "OTHER PROGRAMS" section header; outlined cards with name, `<weeks> weeks · <state>` muted line.
- States: `completed <N> months ago`, `draft`, `never started`.
- Bottom muted "Browse templates" link — drop or empty placeholder per A13.

**`design/program-detail.png`**
- Top bar: back arrow, program name, kebab (Edit, End program; Duplicate deferred).
- Summary strip: `<weeks> weeks · <subtitle> · Started <date>`, progress bar, `Week N of M` chip, `<percent>% COMPLETION`.
- Tab segment with only SCHEDULE rendered in v1; OVERVIEW and STATS hidden.
- Week grid: rows per week, 7-day cells (Sun–Sat); states visualized via completed check, amber-outlined current, struck-through skipped, outlined upcoming, routine-label pills, muted-dash rest days.
- CURRENT PERIOD week highlighted with `PROGRESSING` chip.
- Footer: `COPY WEEK PATTERN` (outlined) and `EDIT PROGRAM` (amber primary).

## Existing Code to Leverage

**`specs/exercise-library/planning/spec.md` end-to-end pattern**
- Mirror Drizzle layout, Zod split, Hono router wiring, Dexie store shape, list/detail/create page split, `pendingWrites` outbox usage. Reuse error shape `{ error, issues?, id? }` and the `409 id_conflict` convention.

**`specs/routines/planning/spec.md` nested whole-document pattern**
- Reuse the parent/child cascade strategy (`routines` / `routine_blocks` / `routine_items`) for `programs` / `program_days` and `program_runs` / `program_run_day_states`. PATCH = transactional delete-children + reinsert-from-payload. Dexie folds children into the parent document; server stores normalized.
- Lift the routine-picker primitive (the exercise-picker pattern from routine-builder) for the per-day routine picker — name-substring search over Dexie `routines`.

**`specs/workout-sessions/planning/spec.md` hydration contract**
- Already defines `sourceType='program_day'`, `sourceProgramId`, `sourceProgramWeekIndex`, `sourceProgramDayIndex`. Programs spec produces data matching this contract; the post-finish reconciler joins on these keys to upsert `program_run_day_states`.

**`src/shared/pending-write.ts` and `src/client/sync/flusher.ts` + `reconcile.ts`**
- Already generic — extend `PendingEntityEnum` with `'program'` and `'program_run'`. No structural change. Add new `programs` / `programRuns` Dexie stores in `src/client/db/forge-db.ts` alongside existing stores; only the dispatch table in flusher/reconcile grows.

**`src/client/lib/theme.ts` + `src/client/styles.css` design tokens**
- Reuse `--bg`, `--surface`, `--border`, `--accent`, `--accent-fg`, `--text`, `--text-muted`, `--text-subtle`, `--radius-card` for all surfaces. Amber accent on ACTIVE card edge, `EDIT PROGRAM` CTA, current-day outline, `PROGRESSING` chip comes from `--accent`. Register `/programs`, `/programs/new`, `/programs/:id`, `/programs/:id/edit` in `src/client/app.tsx`.

## Out of Scope

- Live session execution (owned by `specs/workout-sessions`).
- Embedded session templates per program day — v1 supports routine reference OR rest day OR unfilled only.
- Calendar-anchored scheduling and prescribed-rest-day weekly templates beyond the simple `isRestDay` flag.
- Variable day count per week — fixed 7 days/week.
- "OVERVIEW" and "STATS" tabs from the detail mockup — only SCHEDULE ships.
- Browse-templates / curated program library; no seed programs.
- Program duplication action (kebab "Duplicate") — deferred.
- Goals (including program-type goals); history aggregations / analytics over programs.
- Bearer-token auth on `/api/v1/programs` and `/api/v1/program-runs`.
- Bulk import/export and bulk API endpoints.
- Snapshot-on-start of program structure — sessions already snapshot at session start.
- Multiple concurrent globally-active programs (intentionally one).
