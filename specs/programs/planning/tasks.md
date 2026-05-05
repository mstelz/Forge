# Task Breakdown: Programs (Plan Layer)

## Overview

Programs is the multi-week planning + run-tracking layer on top of Routines and Workout Sessions. It mirrors those slices end-to-end: Drizzle in `src/db`, Zod in `src/shared`, Hono in `src/server`, Dexie + generic `pending_writes` outbox in `src/client`. No new flusher logic — only new entity discriminators (`'program'`, `'program_run'`). Programs spec does NOT own session creation; workout-sessions hydrates from a program-day reference, and a reconciler joins logged sessions back onto `program_run_day_states`.

Total Tasks: ~62 across 11 phases.

Visual references:
- `/home/mike/Development/Forge/design/programs-list.png` (authoritative for list layout)
- `/home/mike/Development/Forge/design/program-detail.png` (authoritative for detail/schedule layout)

Authoritative spec: `/home/mike/Development/Forge/specs/programs/planning/spec.md`

Status legend: `[x]` done, `[~]` partial, `[ ]` not started.

---

## Phase 1: Drizzle schema + migration (`programs`, `program_days`, `program_runs`, `program_run_day_states`)

**Dependencies:** Existing `src/db/schema.ts` (exercises, equipment, routines + children, sessions + logs).

### 1.1 [ ] Add `programs` Drizzle table
- Columns per spec § Domain model — programs: `id` (text PK), `name` (text NN), `description` (text nullable), `durationWeeks` (int NN, 1–52 enforced in Zod, runtime check on insert), `createdAt`, `updatedAt` (`integer` `timestamp_ms` NN).
- Indexes: `idx_programs_name` on `name`, `idx_programs_updated_at` on `updatedAt`.
- Files: `src/db/schema.ts`.

### 1.2 [ ] Add `program_days` Drizzle table
- Columns: `id` (text PK), `programId` (text NN, FK → `programs.id` `onDelete: 'cascade'`), `weekIndex` (int NN, 0-based), `dayIndex` (int NN, 0–6), `routineId` (text nullable — soft FK; no DB FK constraint, mirrors `routine_items.exerciseId`), `isRestDay` (int NN default 0), `notes` (text nullable, max 1000 enforced in Zod).
- Indexes: `idx_program_days_program_week_day` UNIQUE on `(programId, weekIndex, dayIndex)`; `idx_program_days_routine` on `routineId`.
- Sparse storage — only persisted rows for filled / rest / noted days.
- Files: `src/db/schema.ts`.

### 1.3 [ ] Add `program_runs` Drizzle table
- Columns: `id` (text PK), `programId` (text NN, FK → `programs.id` `onDelete: 'cascade'`), `status` (text NN — `'active' | 'completed' | 'abandoned'`), `startedAt` (`timestamp_ms` NN), `endedAt` (`timestamp_ms` nullable), `currentWeekIndex` (int NN default 0), `currentDayIndex` (int NN default 0), `createdAt`, `updatedAt` (`timestamp_ms` NN).
- Indexes: `idx_program_runs_program` on `programId`; `idx_program_runs_status` on `status`.
- Partial-unique runtime guards (server-enforced, see Phase 3): at most one row globally with `status='active'`; at most one per `programId` with `status='active'`. If Drizzle's index DSL allows partial unique, add `idx_program_runs_one_active` on `status` `WHERE status='active'`; otherwise hand-edit the migration SQL.
- Files: `src/db/schema.ts`.

### 1.4 [ ] Add `program_run_day_states` Drizzle table
- Columns: `id` (text PK), `programRunId` (text NN, FK → `program_runs.id` `onDelete: 'cascade'`), `weekIndex` (int NN), `dayIndex` (int NN), `status` (text NN — `'not_started' | 'active' | 'completed' | 'skipped'`), `sessionId` (text nullable — soft FK, nulled lazily on next reconcile if session deleted), `updatedAt` (`timestamp_ms` NN).
- Indexes: `idx_prds_run_week_day` UNIQUE on `(programRunId, weekIndex, dayIndex)`; `idx_prds_session` on `sessionId`.
- Lazy materialization — rows created only when a day is touched.
- Files: `src/db/schema.ts`.

### 1.5 [ ] Generate and commit migration
- Run `bun run db:generate`; verify the four tables, FK cascades, and indexes (including any partial unique). `bun run db:migrate` runs cleanly against an existing DB.
- Files: `src/db/migrations/<timestamp>_*.sql`.

**Acceptance Criteria (Phase 1):** Fresh DB migrates cleanly; all four tables exist with cascade FKs and required indexes; deleting a `programs` row cascades through `program_days`, `program_runs`, `program_run_day_states`.

---

## Phase 2: Shared Zod schemas (`src/shared/program.ts`, `src/shared/program-run.ts`)

**Dependencies:** Phase 1 conceptually; runtime independent.

### 2.1 [ ] Define `ProgramDaySchema` in `src/shared/program.ts`
- `{ id: uuid, weekIndex: int().min(0), dayIndex: int().min(0).max(6), routineId: uuid().nullable(), isRestDay: boolean, notes: string().max(1000).nullable().optional() }`.
- Files: `src/shared/program.ts` (new).

### 2.2 [ ] Define `ProgramSchema`, `ProgramCreateInput`, `ProgramUpdateInput`
- `ProgramSchema`: `{ id, name: trim().min(1).max(100), description: string().max(2000).nullable().optional(), durationWeeks: int().min(1).max(52), days: ProgramDaySchema[], createdAt, updatedAt }`.
- `superRefine`: `(weekIndex, dayIndex)` pairs unique per program; `weekIndex ∈ [0, durationWeeks-1]`; `dayIndex ∈ [0, 6]`; `routineId` and `isRestDay=true` mutually exclusive.
- `ProgramCreateInput` and `ProgramUpdateInput`: full nested document; no patch shape.
- Files: `src/shared/program.ts`.
- Depends on: 2.1.

### 2.3 [ ] Define `ProgramRunStatusEnum`, `ProgramRunDayStatusEnum`, `ProgramRunDayStateSchema`
- `ProgramRunStatusEnum = z.enum(['active','completed','abandoned'])`.
- `ProgramRunDayStatusEnum = z.enum(['not_started','active','completed','skipped'])`.
- `ProgramRunDayStateSchema`: `{ id: uuid, weekIndex: int().min(0), dayIndex: int().min(0).max(6), status: ProgramRunDayStatusEnum, sessionId: uuid().nullable(), updatedAt }`.
- Files: `src/shared/program-run.ts` (new).

### 2.4 [ ] Define `ProgramRunSchema`, `ProgramRunCreateInput`, `ProgramRunUpdateInput`
- `ProgramRunSchema`: `{ id, programId, status: ProgramRunStatusEnum, startedAt, endedAt: int().nullable(), currentWeekIndex: int().min(0), currentDayIndex: int().min(0).max(6), dayStates: ProgramRunDayStateSchema[], createdAt, updatedAt }`.
- `ProgramRunCreateInput`: `{ id, programId, startedAt }` (server stamps status, cursor, timestamps).
- `ProgramRunUpdateInput`: full document.
- `superRefine`: `(weekIndex, dayIndex)` pairs unique within `dayStates`; bounds checks deferred to server (needs program lookup).
- Files: `src/shared/program-run.ts`.
- Depends on: 2.3.

### 2.5 [ ] Extend `PendingEntityEnum` with `'program'` and `'program_run'`
- Extend `src/shared/pending-write.ts` `entity` enum. No structural change to `PendingWriteSchema`.
- Files: `src/shared/pending-write.ts`.

### 2.6 [ ] Re-export from `src/shared/index.ts`
- Add `program.ts` and `program-run.ts` exports so `import { ProgramSchema, ProgramRunSchema, type Program, type ProgramRun } from '@/shared'` works on both client and server.
- Files: `src/shared/index.ts`, `src/shared/types.ts`.

### 2.7 [ ] Write 4 focused schema tests
- Limit to 4:
  1. Valid `ProgramCreateInput` with sparse `days[]` parses; rejects `routineId` + `isRestDay=true` simultaneously.
  2. `(weekIndex, dayIndex)` uniqueness enforced; out-of-bounds `weekIndex` (>= `durationWeeks`) rejected.
  3. `ProgramRunCreateInput` parses minimal `{ id, programId, startedAt }`; `ProgramRunUpdateInput` parses full document with nested `dayStates[]`.
  4. `PendingEntityEnum` accepts `'program'` and `'program_run'`; existing routine/session entries still parse.
- Files: `src/shared/__tests__/program.test.ts`.

### 2.8 [ ] Run schema tests
- Run ONLY the 4 tests written in 2.7.

**Acceptance Criteria (Phase 2):** All 4 schema tests pass; spec § Zod schemas requirements covered; no Dexie/Drizzle/Hono imports in `src/shared`.

---

## Phase 3: Hono routes — `/api/v1/programs` + `/api/v1/program-runs`

**Dependencies:** Phase 1, Phase 2.

### 3.1 [ ] Scaffold `/api/v1/programs` sub-router
- Create `src/server/routes/programs.ts` mounted from `src/server/routes/api.ts` under `/programs`. Reuse `src/server/lib/errors.ts` shape.
- Done when: `GET /api/v1/programs` returns `200 { programs: [] }` against an empty DB.
- Files: `src/server/routes/api.ts`, `src/server/routes/programs.ts` (new).

### 3.2 [ ] Implement `loadProgram(id)` server-side helper
- Joins `programs` + `program_days`, sorts days by `(weekIndex, dayIndex)`, returns the nested `Program`.
- Files: `src/server/routes/programs.ts` or `src/server/lib/program-loader.ts` (new).

### 3.3 [ ] Implement Programs GET routes
- `GET /programs` → `200 { programs: Program[] }` (full list with nested `days`).
- `GET /programs/:id` → `200 Program` | `404 { error: 'not_found' }`.
- Depends on: 3.2.

### 3.4 [ ] Implement `POST /programs`
- Body `ProgramCreateInput`. Single SQLite transaction inserting `programs` + `program_days`. `409 id_conflict` on top-level id collision; `400` on Zod failure.
- Server bumps `createdAt`/`updatedAt` if absent.
- Files: `src/server/routes/programs.ts`.

### 3.5 [ ] Implement `PATCH /programs/:id` (full-document replace)
- Body `ProgramUpdateInput`. In a single transaction: assert program exists (`404`); delete existing `program_days`; re-insert from payload; update `programs` row; bump `updatedAt = max(body.updatedAt, Date.now())`.
- Soft-warn (do not reject) on `routineId` references that don't exist (mirrors routines→exercises convention).
- `200` | `404` | `400`.

### 3.6 [ ] Implement `DELETE /programs/:id`
- `204` (idempotent). FK cascades to `program_days`, `program_runs`, `program_run_day_states`.

### 3.7 [ ] Scaffold `/api/v1/program-runs` sub-router
- Create `src/server/routes/program-runs.ts` mounted under `/program-runs`.
- Files: `src/server/routes/api.ts`, `src/server/routes/program-runs.ts` (new).

### 3.8 [ ] Implement `loadProgramRun(id)` helper + GET routes
- `loadProgramRun` joins `program_runs` + `program_run_day_states` and returns nested `ProgramRun`.
- `GET /program-runs` → `200 { runs: ProgramRun[] }`.
- `GET /program-runs/:id` → `200 ProgramRun` | `404`.

### 3.9 [ ] Implement `POST /program-runs`
- Body `ProgramRunCreateInput`. Pre-checks (in-transaction):
  - `409 { error: 'active_run_exists', id }` if any row has `status='active'` for the same `programId`.
  - `409 { error: 'active_run_exists', id }` if any row globally has `status='active'`.
  - `409 { error: 'id_conflict', id }` on id collision.
- Server stamps `status='active'`, `currentWeekIndex=0`, `currentDayIndex=0`, timestamps.
- `201 ProgramRun` | `400` | `409`.

### 3.10 [ ] Implement `PATCH /program-runs/:id` (full-document replace)
- Body `ProgramRunUpdateInput`. In a single transaction: assert run exists (`404`); delete existing `program_run_day_states`; re-insert from payload; update `program_runs` row; bump `updatedAt`.
- Validate `dayStates[].weekIndex` against parent program's `durationWeeks`.
- `200` | `404` | `400`.

### 3.11 [ ] Implement `DELETE /program-runs/:id`
- `204` (idempotent). FK cascades to `program_run_day_states`.

### 3.12 [ ] Manual curl verification
- `bun run dev` then exercise: create program with sparse days, PATCH to add a rest day, POST a run, PATCH the run to advance a day-state to `completed`, attempt a second active run on same program (expect `409 active_run_exists`), DELETE the program (cascade verified).

**Acceptance Criteria (Phase 3):** All endpoints return spec-conformant status codes and bodies; PATCH replaces children transactionally; one-active-run-per-program and one-globally-active guards both fire; consistent error shape `{ error, issues?, id? }`.

---

## Phase 4: Dexie mirror + outbox extension + repository + hooks

**Dependencies:** Phase 2, Phase 3.

### 4.1 [ ] Add `programs` and `programRuns` Dexie stores (schema bump)
- Bump `src/client/db/forge-db.ts` Dexie version. Add:
  - `programs` (keyPath `id`; indexes `name`, `updatedAt`) — full nested document `{ ..., days: [...] }` per row.
  - `programRuns` (keyPath `id`; indexes `programId`, `status`, `startedAt`) — full nested document including `dayStates: []` per row (folded, mirroring routines).
- Files: `src/client/db/forge-db.ts`.

### 4.2 [ ] Implement transactional program write helpers
- `createProgram(program)`, `updateProgram(program)`, `deleteProgram(id)`. Each is ONE Dexie transaction touching `programs` + `pendingWrites` with `entity='program'`. Payload for create/update is the full nested document; payload for delete is `{ id }`.
- Files: `src/client/db/mutations.ts` (extend).
- Depends on: 4.1.

### 4.3 [ ] Implement transactional program-run write helpers
- `createProgramRun(run)`, `updateProgramRun(run)`, `deleteProgramRun(id)`. Each is ONE Dexie transaction touching `programRuns` + `pendingWrites` with `entity='program_run'`. Day-state changes during a run issue full-run PATCHes (one outbox entry per change).
- `endProgramRun(id, status, endedAt)` helper sets `status` to `'completed'` or `'abandoned'`, stamps `endedAt`, enqueues update.
- Pre-write guard: refuse to mutate a run with `status ∈ {'completed','abandoned'}` (throws typed error consumed by UI).
- Files: `src/client/db/mutations.ts`.
- Depends on: 4.1.

### 4.4 [ ] Implement Dexie read helpers + query keys
- `listPrograms()`, `getProgramById(id)`.
- `listProgramRuns()`, `getProgramRunById(id)`, `getActiveRunForProgram(programId)`, `getGloballyActiveRun()`, `listFinishedRunsForProgram(programId)` (`status ∈ {'completed','abandoned'}`, ordered by `endedAt` DESC).
- Add to `query-keys.ts`.
- Files: `src/client/db/queries.ts`, `src/client/db/query-keys.ts`.

### 4.5 [ ] Wire `entity='program'` into the flusher
- Extend `src/client/sync/flusher.ts` dispatch:
  - `program.create` → `POST /api/v1/programs`. Drop on `201` / `409 id_conflict`.
  - `program.update` → `PATCH /api/v1/programs/:id`. Drop on `200` / `404`.
  - `program.delete` → `DELETE /api/v1/programs/:id`. Drop on `204`.
- Files: `src/client/sync/flusher.ts`.

### 4.6 [ ] Wire `entity='program_run'` into the flusher
- Extend dispatch:
  - `program_run.create` → `POST /api/v1/program-runs`. `201` drop; `409 active_run_exists` → surface to UI (toast + offer Resume) + drop entry; `409 id_conflict` → log + drop.
  - `program_run.update` → `PATCH /api/v1/program-runs/:id`. Drop on `200` / `404`.
  - `program_run.delete` → `DELETE /api/v1/program-runs/:id`. Drop on `204`.
- Files: `src/client/sync/flusher.ts`.

### 4.7 [ ] Wire reconciliation (pull) for programs and program-runs
- Extend `src/client/sync/reconcile.ts`: GET `/api/v1/programs` and `/api/v1/program-runs`. Same local-wins-while-pending merge rule used by routines: if any outbox entry exists for that id, keep local; else server replaces local; missing locals get added; locals not on server with no pending `create` get removed.
- Files: `src/client/sync/reconcile.ts`.

### 4.8 [ ] Implement post-session reconciler hook for run day-states
- New `src/client/sync/program-run-reconciler.ts`: after a workout-session write finishes (Dexie listener or post-flush callback), find any session with `sourceType='program_day'` + `(sourceProgramId, sourceProgramWeekIndex, sourceProgramDayIndex)`. Upsert the matching `program_run_day_states` row in the active run for that program:
  - On session start (`status='in_progress'`) → set day-state `status='active'`, link `sessionId`.
  - On session finish (`status='finished'`) → set day-state `status='completed'`, link `sessionId`.
  - If session is deleted → null `sessionId` (lazy nulling, no auto-revert of state).
- Auto-complete run: when every non-rest day reaches `completed` or `skipped`, transition run to `status='completed'` and stamp `endedAt`.
- Idempotent; runs on app load and after session writes.
- Files: `src/client/sync/program-run-reconciler.ts` (new); wire into app bootstrap and session-mutation hooks.

### 4.9 [ ] Tanstack Query hooks
- `usePrograms()`, `useProgram(id)`.
- `useProgramRuns()`, `useProgramRun(id)`, `useActiveRunForProgram(programId)`, `useGloballyActiveRun()`.
- Files: `src/client/hooks/use-programs.ts` (new), `src/client/hooks/use-program-runs.ts` (new).
- Depends on: 4.4.

### 4.10 [ ] Write 4 focused repository/flusher tests
- Limit to 4:
  1. `createProgram` writes both `programs` and `pendingWrites` rows in one transaction; rollback on failure.
  2. `createProgramRun` enqueues exactly one outbox entry; pre-write guard blocks mutation against a `'completed'` run.
  3. Flusher routes `program_run.create` returning `409 active_run_exists` to a UI surface (toast/banner) and drops the entry.
  4. `program-run-reconciler` upserts `program_run_day_states` to `'completed'` when a matching session finishes (idempotent on re-run).
- Files: `src/client/db/__tests__/program-mutations.test.ts`, `src/client/sync/__tests__/program-run-reconciler.test.ts`.

### 4.11 [ ] Run repository tests
- Run ONLY the 4 tests written in 4.10.

**Acceptance Criteria (Phase 4):** Console-driven `createProgram` round-trips through outbox to a running server; reconcile preserves pending writes; post-session reconciler updates day-state correctly on session start/finish.

---

## Phase 5: Programs list page (`/programs`)

**Dependencies:** Phase 4. Mockup `design/programs-list.png`.

### 5.1 [ ] Register routes + page skeleton + drawer entry
- Add `/programs`, `/programs/new`, `/programs/:id`, `/programs/:id/edit` to the router (`src/client/app.tsx`).
- Top bar: hamburger, "PROGRAMS" title, `+` action linking to `/programs/new`. Add drawer-nav entry "Programs".
- Files: `src/client/pages/programs/list.tsx` (new), router config, drawer component.

### 5.2 [ ] Search input
- Full-width input with placeholder `Search programs`. Case-insensitive substring over `name`. Trimmed. Visually-hidden label + `aria-label`.
- Files: `src/client/pages/programs/search.tsx` (new) or inline.

### 5.3 [ ] ACTIVE program card
- Reads `useGloballyActiveRun()`. When present, renders a top card with amber left edge accent, "ACTIVE" tag, program name, `Week N of M · <subtitle>` line.
- Progress bar (% complete = `completed_or_skipped_non_rest_days / total_non_rest_days`); 8 week dots (filled / half / empty) summarizing run progress across the program duration (if `durationWeeks > 8`, summarize proportionally).
- `VIEW PROGRAM ›` link routes to `/programs/:id`.
- Files: `src/client/pages/programs/active-card.tsx` (new), `src/client/lib/programs/run-progress.ts` (new helper).

### 5.4 [ ] OTHER PROGRAMS list (alpha sort)
- Section header "OTHER PROGRAMS". Outlined cards with name and muted subtitle:
  - `<weeks> weeks · completed <N> months ago` (latest finished run).
  - `<weeks> weeks · draft` (no runs ever).
  - `<weeks> weeks · never started` (never had an active run, distinct from draft state — v1 conflates: anything without a run is "draft").
- Excludes the currently-active program (rendered above).
- Memoized selector: trim + lowercase search, substring match on `name`, then sort by `name` ASC, locale-aware.
- Files: `src/client/pages/programs/other-list.tsx` (new), `src/client/pages/programs/use-filtered-programs.ts` (new).

### 5.5 [ ] Empty + zero-match + loading states
- Loading: skeleton rows during first Dexie read.
- Full-empty: centered "No programs yet" + create CTA routing to `/programs/new`.
- Zero-match: inline "No matches" row with "Clear search" button.
- Bottom muted "Browse templates" link omitted in v1 (per spec § Out of scope).
- Files: `src/client/pages/programs/empty-states.tsx` (new) or inline.

### 5.6 [ ] Delete confirmation flow
- Card overflow menu with **Delete**; Radix Dialog confirming destructive delete; on confirm call `deleteProgram(id)` (Dexie + outbox). Cascades runs server-side.
- Refuse to delete a program with an active run (UI guard) — show toast "End the active run first".
- Files: `src/client/pages/programs/delete-dialog.tsx` (new).

**Acceptance Criteria (Phase 5):** List renders ACTIVE card + OTHER PROGRAMS sorted alphabetically; search filters live; Delete from row overflow round-trips offline; empty/zero-match/loading states match mockup density.

---

## Phase 6: Programs builder (`/programs/new`, `/programs/:id/edit`)

**Dependencies:** Phase 5. Reuses the routine picker primitive from routines slice.

### 6.1 [ ] Builder page skeleton + routes
- `/programs/new` renders `<ProgramBuilderPage mode="create" />`; `/programs/:id/edit` renders `<ProgramBuilderPage mode="edit" />`.
- Top bar: back arrow with dirty-state guard, title (`New program` / `Edit program`), prominent amber **Save** button.
- Local builder state via `useReducer` (or small Zustand store) holding the in-progress nested program document. Initialize empty for create (default `durationWeeks=4`, no days), prefill from `useProgram(id)` for edit.
- 404 state if `:id` not in Dexie.
- Files: `src/client/pages/programs/builder/index.tsx` (new), `src/client/pages/programs/builder/state.ts` (new).

### 6.2 [ ] Header card (name, description, durationWeeks stepper)
- Inline-edit `name` (bold, large, required 1–100 chars).
- `description` line tap-to-edit (max 2000 chars, placeholder `Describe this program…`).
- `durationWeeks` numeric stepper (1–52). Shrinking warns + drops out-of-range days on save (`weekIndex >= newDuration`).
- Files: `src/client/pages/programs/builder/header-card.tsx` (new).

### 6.3 [ ] Week grid editor
- Renders one row per week, 7-day cells across (Sun–Sat). Each cell shows: routine name (truncated), or "REST" label, or empty `+` placeholder.
- Tap a cell → opens a per-day picker sheet (6.4). Long-press → quick clear / mark rest day.
- Header column shows `WEEK N` label per row.
- Files: `src/client/pages/programs/builder/week-grid.tsx` (new), `src/client/pages/programs/builder/day-cell.tsx` (new).

### 6.4 [ ] Per-day picker sheet (reuses routine picker)
- Bottom sheet with: name-substring search over Dexie `routines` (lift the routine-picker primitive from routines slice; if not yet a shared component, extract it to `src/client/components/routine-picker.tsx`).
- Options:
  - **Assign routine** → tap a routine row.
  - **Mark as rest day** (mutually exclusive with routine).
  - **Add notes** (textarea, max 1000 chars).
  - **Clear** (removes the day from sparse list).
- Files: `src/client/pages/programs/builder/day-picker.tsx` (new), possibly `src/client/components/routine-picker.tsx` (extract from routines).

### 6.5 [ ] Duplicate-week affordance
- Top-of-grid action menu **Duplicate week**. Modal: select source week N, select destination range X–Y. On apply, overwrites all 7 day assignments in the destination range with deep-cloned copies of week N (mints fresh `program_days[].id` UUIDs).
- Confirm dialog when any destination week has existing assignments.
- Operates on in-memory builder document; persisted only on Save.
- Files: `src/client/pages/programs/builder/duplicate-week.tsx` (new).

### 6.6 [ ] Repeat-pattern affordance
- Top-of-grid action menu **Repeat pattern**. Modal: select source weeks 1–N, applies to remaining duration (`sourceEnd+1 .. durationWeeks-1`).
- Tiles the pattern; if `(durationWeeks - sourceEnd)` is not a multiple of N, trailing weeks copy the prefix that fits (truncates).
- Mints fresh `program_days[].id` UUIDs for every copied row. Confirm dialog when any target week has existing assignments.
- Files: `src/client/pages/programs/builder/repeat-pattern.tsx` (new).

### 6.7 [ ] Save + Discard wiring
- Save: run client-side Zod against `ProgramCreateInput`/`ProgramUpdateInput`; assign UUIDs to any new `program_days`; on success call `createProgram`/`updateProgram` and navigate back to `/programs`. On Zod failure surface field errors in a top-of-form error region.
- Discard: dirty-state guard prompts a confirm dialog when leaving with unsaved changes (back arrow, browser back, drawer nav). React Router `useBlocker` or equivalent.
- Files: `src/client/pages/programs/builder/save.ts` (new), `src/client/pages/programs/builder/discard-guard.tsx` (new).

### 6.8 [ ] Write 3 focused builder tests
- Limit to 3:
  1. Duplicate week N to weeks X–Y deep-clones day assignments and mints fresh UUIDs (no PK collisions on save payload).
  2. Repeat pattern across remaining duration tiles correctly and truncates the trailing partial pattern.
  3. Save validates with Zod; rejects a day with both `routineId` set and `isRestDay=true`.
- Files: `src/client/pages/programs/builder/__tests__/builder.test.ts`.

### 6.9 [ ] Run builder tests
- Run ONLY the 3 tests written in 6.8.

**Acceptance Criteria (Phase 6):** Builder loads empty for create, prefilled for edit; week grid edits via day picker; duplicate-week and repeat-pattern produce correct payloads; save persists offline and navigates back; dirty-state guard fires on unsaved leaves.

---

## Phase 7: Program detail / preview page (`/programs/:id`)

**Dependencies:** Phase 4, Phase 5. Mockup `design/program-detail.png`.

### 7.1 [ ] Detail page route + skeleton
- `/programs/:id` renders `<ProgramDetailPage />`. Reads `useProgram(id)` and `useActiveRunForProgram(id)`. 404 state if program missing.
- Top bar: back arrow, program name, kebab with **Edit** (→ `/programs/:id/edit`) and **End program** (Phase 8). **Duplicate** deferred per spec.
- Files: `src/client/pages/programs/detail.tsx` (new).

### 7.2 [ ] Summary strip
- `<weeks> weeks · <subtitle> · Started <date>` (subtitle = description first line or "Custom program"; `Started <date>` only when a run is active or the most recent run exists).
- Progress bar + `Week N of M` chip + `<percent>% COMPLETION` (derived from active run's day-states; hidden when no run exists).
- Files: `src/client/pages/programs/detail/summary.tsx` (new).

### 7.3 [ ] Tab segment (SCHEDULE only in v1)
- Renders only **SCHEDULE** tab; OVERVIEW and STATS hidden per spec.
- Files: `src/client/pages/programs/detail/tabs.tsx` (new).

### 7.4 [ ] Week grid (read-only with run progress pills)
- Rows per week, 7-day cells. States visualized:
  - Completed: green check glyph + routine label pill.
  - Current (active run cursor): amber outline + routine label pill.
  - Skipped: muted dash with strike + label pill.
  - Upcoming (`not_started`): outlined cell + routine label pill.
  - Rest day: muted dash, no routine label.
  - Unfilled: empty cell.
- CURRENT PERIOD week (the week containing the active cursor) highlighted with `PROGRESSING` chip.
- Files: `src/client/pages/programs/detail/week-grid.tsx` (new), `src/client/pages/programs/detail/day-cell.tsx` (new).

### 7.5 [ ] Day-cell long-press / overflow menu (hooks for Phase 8)
- Long-press / overflow on a day cell exposes:
  - **Start workout** when `not_started` and active run exists and not a rest day.
  - **Resume** when `active`.
  - **Skip day** when `not_started` or `active`.
  - **Unskip** when `skipped`.
- Wiring lands in Phase 8; Phase 7 only renders the menu shell + actions (no-op handlers).
- Files: `src/client/pages/programs/detail/day-menu.tsx` (new).

### 7.6 [ ] Footer actions
- `COPY WEEK PATTERN` (outlined; routes back to builder with the repeat-pattern modal pre-opened) and `EDIT PROGRAM` (amber primary; routes to `/programs/:id/edit`).
- Files: `src/client/pages/programs/detail/footer.tsx` (new).

**Acceptance Criteria (Phase 7):** Detail page matches `design/program-detail.png` structure; SCHEDULE tab renders week grid with day-state pills; CURRENT PERIOD chip lands on the right week; 404 state for missing id.

---

## Phase 8: Program run lifecycle UI (start, advance, skip/unskip, end/abandon)

**Dependencies:** Phase 4, Phase 7.

### 8.1 [ ] "Start program" CTA on detail page
- Renders below the summary strip when no active run exists for this program AND no globally-active run exists.
- When a globally-active run exists for a DIFFERENT program: render the CTA disabled with tooltip "End your active program first".
- Tap → calls `createProgramRun({ id: uuid(), programId, startedAt: Date.now() })`. Dexie write + outbox enqueue. Optimistic; no navigation.
- Files: `src/client/pages/programs/detail/start-cta.tsx` (new).

### 8.2 [ ] Derived next-playable-day helper
- Pure helper `computeNextPlayableDay(program, run)` walks `(weekIndex, dayIndex)` in order; returns the first slot that is non-rest AND has a `day_state` of `not_started` or no day_state row. Returns `null` when the run is exhausted.
- Updates run's persisted `currentWeekIndex` / `currentDayIndex` via `updateProgramRun` (informational cursor; helper is source of truth).
- Files: `src/client/lib/programs/next-day.ts` (new).

### 8.3 [ ] Skip / Unskip day actions (wiring 7.5)
- **Skip day** on a `not_started` or `active` day → upserts a `program_run_day_states` row with `status='skipped'` (lazy-create if missing). Issues a single `program_run.update` outbox entry with the full nested document.
- **Unskip** → reverts the day-state to `not_started` (delete the row from `dayStates[]`, OR set `status='not_started'` — spec says reversible to `not_started`; persist via row removal for cleanliness).
- Rest days are immutable (cannot be started, cannot be skipped — UI menu hides those actions on rest cells).
- Once `completed`, a day cannot be reverted manually (UI hides Skip/Unskip on completed cells).
- Files: `src/client/pages/programs/detail/skip-actions.ts` (new).

### 8.4 [ ] Auto-complete run when all non-rest days resolve
- After every `updateProgramRun` (skip/unskip/day-state change) and after the post-session reconciler upserts a `completed` day-state, recompute: if every non-rest day in the program has a `dayStates[]` row with `status ∈ {'completed','skipped'}`, transition run to `status='completed'` and stamp `endedAt = Date.now()` via `endProgramRun`.
- Files: `src/client/sync/program-run-reconciler.ts` (extend from Phase 4.8).

### 8.5 [ ] End program (kebab → confirm dialog)
- Kebab on detail page **End program** → Radix Dialog "End this program? You'll be able to start a new run after." On confirm: `endProgramRun(activeRunId, status='abandoned', endedAt=Date.now())`. Optimistic; "Start program" CTA reappears.
- Files: `src/client/pages/programs/detail/end-dialog.tsx` (new).

### 8.6 [ ] Edit-program-during-active-run semantics
- Per spec: edits to a program's day-routine assignments take effect for `not_started` days only; sessions already snapshot the routine at session start, so completed/active days are unaffected.
- Add a banner in the builder header card when editing a program with an active run: "An active run is in progress — only not-started days will reflect changes."
- Files: extend `src/client/pages/programs/builder/header-card.tsx` (Phase 6.2).

### 8.7 [ ] Write 3 focused lifecycle tests
- Limit to 3:
  1. `createProgramRun` succeeds when no active run exists; pre-write guard / server `409 active_run_exists` blocks a second concurrent run for the same program.
  2. Skip-then-unskip a day-state round-trips: `not_started → skipped → not_started` (row removed on unskip).
  3. Auto-complete fires when the last remaining non-rest day transitions to `completed`; run `status='completed'`, `endedAt` stamped.
- Files: `src/client/pages/programs/detail/__tests__/lifecycle.test.ts`.

### 8.8 [ ] Run lifecycle tests
- Run ONLY the 3 tests written in 8.7.

**Acceptance Criteria (Phase 8):** Start program enforces single-active invariant; skip/unskip toggles correctly with rest-day immutability; end program transitions to `'abandoned'` and frees the slot for a new run; auto-complete fires on final non-rest day completion.

---

## Phase 9: Workout-sessions integration (program-day → session hydration)

**Dependencies:** Phase 4, Phase 7, Phase 8, and existing `specs/workout-sessions` Phase 6 entrypoint.

### 9.1 [ ] "From your program" card data source
- The workout-sessions slice already owns the `<ProgramCard />` component on `/workout/start` (its Phase 6.3). This phase wires its data source to the programs slice:
  - Read `useGloballyActiveRun()` and `useProgram(run.programId)`.
  - Compute `nextDay = computeNextPlayableDay(program, run)`. Hide the card when `nextDay === null`.
  - Render: program name, `Week <weekIndex+1>, Day <dayName>` subtitle, summary of the day's routine (5-row exercise summary derived from `useRoutine(routineId)`), estimated duration chip, primary amber **START PLANNED** CTA.
- Files: edit `src/client/pages/workout/program-card.tsx` (workout-sessions Phase 6.3) — replace the v1 stub feature-gate with active wiring.

### 9.2 [ ] START PLANNED hydration call
- Tap → builds the session create payload exactly per spec § Program-day → session hydration contract:
  - `sourceType='program_day'`
  - `sourceProgramId = program.id`
  - `sourceProgramWeekIndex = nextDay.weekIndex`
  - `sourceProgramDayIndex = nextDay.dayIndex`
  - `templateSnapshot` resolved from `program_days.routineId` at start (deep-clone the routine document with fresh `performedExerciseId`/`sessionItemId`/`plannedSetId` UUIDs — reuse `src/client/lib/session/hydrate.ts` from workout-sessions Phase 6.4).
- Calls `createSession(...)`; navigates to `/workout/active`.
- Files: `src/client/pages/workout/program-card.tsx` (extend), reuse `src/client/lib/session/hydrate.ts`.

### 9.3 [ ] Reconciler completes day-state on session finish (verify)
- The post-session reconciler (Phase 4.8) already upserts `program_run_day_states` to `'completed'` when a session with matching `sourceType='program_day'` keys reaches `status='finished'`. Add an integration test asserting this flow end-to-end.
- Files: extend `src/client/sync/__tests__/program-run-reconciler.test.ts`.

### 9.4 [ ] "Start workout" from day cell long-press (detail page)
- When a day cell's overflow menu fires **Start workout** (Phase 7.5 + 8.3), the handler builds the same hydration payload as 9.2 but using the cell's `(weekIndex, dayIndex)` rather than the cursor — allowing the user to jump ahead. Server / client guards prevent starting a non-rest, non-completed day; rest days and completed days hide this action.
- After session creation, the reconciler stamps `program_run_day_states.status='active'` for that cell on session start, then `'completed'` on finish.
- Files: `src/client/pages/programs/detail/start-from-cell.ts` (new).

### 9.5 [ ] Write 2 focused integration tests
- Limit to 2:
  1. START PLANNED creates a session with the correct `sourceProgramId/Week/Day` fields and a fresh-UUID `templateSnapshot` clone of the program-day's routine.
  2. Finishing that session causes the reconciler to upsert `program_run_day_states` to `status='completed'` with the session's id linked.
- Files: `src/client/pages/workout/__tests__/program-hydration.test.ts`.

### 9.6 [ ] Run integration tests
- Run ONLY the 2 tests written in 9.5.

**Acceptance Criteria (Phase 9):** Starting from a program day produces a session that satisfies the workout-sessions hydration contract; finishing the session updates the run's day-state without programs spec owning session writes; "Start workout" from a future day cell works.

---

## Phase 10: Polish (validation, error states, empty states, mobile density)

**Dependencies:** Phases 5–9.

### 10.1 [ ] Inline validation on builder Save
- Map Zod `issues` paths (e.g., `days.3.routineId`) to specific field error rendering inside the builder. Show a sticky top error banner with a count when multiple errors exist; clicking banner scrolls to first invalid field.
- Files: `src/client/pages/programs/builder/validation.tsx` (new), updates to existing field components.

### 10.2 [ ] Error states (offline writes blocked, 409 active_run_exists, soft-warn missing routine)
- Surface flusher errors:
  - `409 active_run_exists` on `program_run.create` → toast + offer Resume of the actual active run.
  - Server soft-warn on missing `routineId` → log to console only (mirror routines→exercises convention; no UI surface).
- Reuse the global outbox-error banner from Exercise Library Phase 10; verify it covers `entity ∈ {'program','program_run'}` failures.
- Files: `src/client/sync/flusher-banner.tsx` (verify).

### 10.3 [ ] Empty / draft / never-started states
- Programs list with zero programs: full-empty state from 5.5.
- Program detail with zero `program_days` (legal): week grid renders all-empty cells; CTA "Start program" remains available but warns "This program has no scheduled days".
- Program with no runs ever: no progress strip; subtitle reads `<weeks> weeks · draft`.
- Files: extend existing surfaces.

### 10.4 [ ] Missing routine placeholder in week grid
- When a `program_days[].routineId` no longer exists in Dexie (cross-spec deletion), render the cell with a muted "Missing routine" label + a `Replace` action that opens the day picker. Persist unchanged otherwise.
- Files: `src/client/pages/programs/builder/missing-routine.tsx` (new); also surfaces on detail page week grid as a muted pill with a warning glyph.

### 10.5 [ ] Mobile density + responsive week grid
- On screens < 480px: collapse week grid cells to icon-only state (routine name truncated to first letter or icon); long-press shows the full label tooltip. Tap-targets ≥ 44px.
- On screens ≥ 1024px: optionally render two weeks per row in detail view (deferred — single-column is fine for v1).
- Files: `src/client/pages/programs/detail/week-grid.tsx`, `src/client/pages/programs/builder/week-grid.tsx`.

### 10.6 [ ] Accessibility sweep
- Verify: drag-free week grid still keyboard-navigable (arrow keys to move between cells, Enter to open picker); progress bar has `role="progressbar"` with `aria-valuenow`; CURRENT PERIOD chip has `aria-current="step"`; mode/status pills have accessible names ("Day 3, completed"); kebab and overflow menus trap focus correctly; mm:ss durations (none here, but week labels) have proper labeling.
- Files: any components missing a11y wiring.

### 10.7 [ ] Token audit
- Verify amber accent on ACTIVE card edge, EDIT PROGRAM CTA, current-day outline, PROGRESSING chip all use `--accent` / `--accent-fg`. Surfaces use `--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--text-subtle`, `--radius-card` per `src/client/lib/theme.ts`.
- Files: `src/client/styles.css` only if a specific pairing fails WCAG AA.

**Acceptance Criteria (Phase 10):** Every Zod rule surfaces as a readable inline error; missing-routine doesn't crash the builder or detail page; keyboard-only navigation reaches every editable surface; outbox errors visible; mobile density honored.

---

## Phase 11: Manual verification against mockups

**Dependencies:** All prior phases.

### 11.1 [ ] Manual test checklist
Run `bun run dev` and step through every flow with `design/programs-list.png` and `design/program-detail.png` open side-by-side:

- [ ] Visit `/programs` with empty Dexie: "No programs yet" empty state with create CTA.
- [ ] Tap `+` → `/programs/new` → builder loads empty with name placeholder, durationWeeks default 4, empty 4×7 grid.
- [ ] Set name "Hypertrophy 12" + description; bump durationWeeks to 12; assign Bench Day routine to Week 1 / Mon, Squat Day to Week 1 / Wed, mark Sat as rest day; Save → redirects to `/programs`.
- [ ] List shows the program in OTHER PROGRAMS sorted alphabetically with `12 weeks · draft` subtitle.
- [ ] Reopen `/programs/:id/edit`; use **Duplicate week** to copy Week 1 into Weeks 2–4; Save; reopen — Weeks 2–4 carry the same assignments with fresh UUIDs (verify via Dexie devtools).
- [ ] Use **Repeat pattern** with Weeks 1–2 across remaining duration; trailing partial pattern truncates correctly when `(durationWeeks - 2)` is not a multiple of 2.
- [ ] Visit `/programs/:id`: SCHEDULE tab renders 12-week grid; routine label pills on filled days; muted dash on rest days; outlined upcoming cells; no progress strip yet (no run).
- [ ] Tap **Start program** CTA → run created; ACTIVE card now appears at top of `/programs` list with `Week 1 of 12 · <subtitle>` + progress bar + 8 week dots; `VIEW PROGRAM ›` returns to detail.
- [ ] On detail, summary strip now shows `Started <today>` and `0% COMPLETION`; CURRENT PERIOD chip on Week 1 with `PROGRESSING` label.
- [ ] Long-press a `not_started` non-rest day → menu offers **Start workout** + **Skip day**.
- [ ] Tap **Start workout** on Week 1 / Mon → routes to `/workout/active` with a session whose `sourceType='program_day'`, `sourceProgramId/Week/Day` set; `templateSnapshot` cloned from the day's routine.
- [ ] Log all sets and Finish → return to `/programs/:id`; Week 1 / Mon now shows green check; `% COMPLETION` and progress bar advance.
- [ ] Long-press Week 1 / Wed → **Skip day**; cell renders muted-dash-with-strike; Unskip reverts to outlined upcoming.
- [ ] Visit `/workout/start` while run active: "From your program" card surfaces with next playable day (Week 1 / Wed if not skipped, else Week 1 / Fri); START PLANNED creates the session.
- [ ] Open another program's detail → **Start program** CTA disabled with tooltip "End your active program first".
- [ ] Kebab → **End program** → confirm → run transitions to `abandoned`; ACTIVE card disappears; "Start program" CTA reappears on detail.
- [ ] Delete a routine referenced by the program; reopen the builder — affected day cells render "Missing routine" with Replace action.
- [ ] Offline scenario: edit program + skip 2 days while offline → outbox accumulates entries; go online → all drain in order.
- [ ] Refresh mid-outbox with server down: pending entries persist and flush when server returns.
- [ ] Delete a program with no active run from list overflow → confirm → row gone; outbox has one delete entry; server cascades.
- [ ] Attempt to delete a program with an active run → UI guard blocks with toast "End the active run first".
- [ ] Keyboard-only: tab through builder; arrow keys navigate week grid; Enter opens day picker; Escape closes; tab through detail page reaches every action.

**Acceptance Criteria (Phase 11):** Every checklist item passes; programs list and detail surfaces visually match `design/programs-list.png` and `design/program-detail.png` in structure, density, and accent treatment; offline writes survive refresh and drain on reconnect; one-globally-active-run invariant holds across surfaces.

---

## Execution Order (recommended)

1. Drizzle schema + migration (Phase 1)
2. Shared Zod schemas (Phase 2)
3. Hono routes (Phase 3)
4. Dexie + outbox extension + repository + reconciler + hooks (Phase 4)
5. Programs list page (Phase 5)
6. Programs builder (Phase 6)
7. Program detail / preview page (Phase 7)
8. Program run lifecycle UI (Phase 8)
9. Workout-sessions integration (Phase 9)
10. Polish (Phase 10)
11. Manual verification against mockups (Phase 11)
