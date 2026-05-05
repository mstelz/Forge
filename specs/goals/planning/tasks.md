# Task Breakdown: Goals

## Status (last updated 2026-05-04)

**Not started.** Greenfield slice with one new Drizzle table (`goals`), one Zod module (`src/shared/goals.ts`), one new Hono sub-router (`/api/v1/goals`), one new Dexie store (`goals`), one progress helper, one reconcile hook, and four new React routes. Reuses `pending_writes` outbox verbatim (`entity='goal'`).

Status legend: `[x]` done, `[~]` partial, `[ ]` not started.

### Phase status

- [ ] Phase 1 — Shared Zod schemas + types
- [ ] Phase 2 — Drizzle schema + migration
- [ ] Phase 3 — Hono API routes (`/api/v1/goals`)
- [ ] Phase 4 — Dexie store + query helpers + outbox wiring
- [ ] Phase 5 — Progress helper + reconcile hook
- [ ] Phase 6 — `/goals` list page UI
- [ ] Phase 7 — `/goals/:id` detail page UI
- [ ] Phase 8 — `/goals/new` + `/goals/:id/edit` form UI
- [ ] Phase 9 — Polish (empty/loading/error states, countdown formatting, currentValue inline edit)
- [ ] Phase 10 — Manual verification against `design/goals-list.png` and `design/goal-form.png`

---

## Overview

Greenfield feature; no migrations to existing tables, no changes to outbox shape, no schema impact on sibling specs. Task ordering matches the exercise-library pattern: shared Zod first, then server, then client storage, then derived helpers, then UI in read-then-write order.

Authoritative spec: `/home/mike/Development/Forge/specs/goals/planning/spec.md`.
Visual references: `/home/mike/Development/Forge/design/goals-list.png`, `/home/mike/Development/Forge/design/goal-form.png`.

Total tasks: ~46 across 10 phases.

---

## Phase 1: Shared (Zod schemas + derived types)

**Dependencies:** None. Every later phase imports from here.

### 1.1 [ ] Define category, status, direction enums
- `GoalCategoryEnum = z.enum(['strength','cardio','weight','measurement','program','other'])`.
- `GoalStatusEnum = z.enum(['active','completed','abandoned'])`.
- `GoalDirectionEnum = z.enum(['up','down'])`.
- Export derived TS types.
- Files: `src/shared/goals.ts` (new), `src/shared/index.ts` (barrel update).

### 1.2 [ ] Define `GoalBaseSchema`
- All fields per spec Data Model with correct nullability and length/numeric constraints.
- Done when: schema parses a fully-populated and a sparse-but-valid record without category-aware checks.
- Depends on: 1.1.

### 1.3 [ ] Define category-aware `enforceCategoryShape` superRefine
- Implements the per-category required/forbidden matrix from spec Data Model.
- Enforces `targetValue !== startValue` when both present, `deadline > createdAt`, `completedAt` present iff `status='completed'`.
- Done when: unit tests cover one valid + one invalid case per category and per cross-field rule.
- Depends on: 1.2.

### 1.4 [ ] Export `GoalSchema`, `GoalCreateSchema`, `GoalUpdateSchema`
- `GoalSchema = GoalBaseSchema.superRefine(enforceCategoryShape)`.
- `GoalCreateSchema = GoalSchema` (full record).
- `GoalUpdateSchema = GoalBaseSchema.partial().extend({ id: uuid }).superRefine(...)` — server merges then re-validates.
- Done when: `import { GoalSchema, type Goal } from '@/shared'` works from client and server.
- Depends on: 1.3.

---

## Phase 2: Drizzle schema + migration

**Dependencies:** Phase 1.

### 2.1 [ ] Add `goals` table to `src/db/schema.ts`
- Columns and types per spec; default `status='active'`.
- Indexes: `idx_goals_status`, `idx_goals_category`, `idx_goals_deadline`, `idx_goals_updated_at`, `idx_goals_linked_exercise`, `idx_goals_linked_program_run`.
- FKs to `exercises(id)` and `program_runs(id)` declared as `text` references with no cascade (soft FKs, consistent with project convention).

### 2.2 [ ] Generate + commit migration
- Run `bun run db:generate`.
- Verify the produced SQL creates the table and indexes; commit migration file.

### 2.3 [ ] Run migration against `./data/forge.db`
- `bun run db:migrate`.
- Smoke-check via `sqlite3 ./data/forge.db ".schema goals"`.

---

## Phase 3: Hono API routes

**Dependencies:** Phases 1, 2.

### 3.1 [ ] Scaffold `src/server/routes/goals.ts`
- New Hono sub-router; mount under `/api/v1/goals` from `src/server/routes/api.ts`.
- Reuse the `{ error, issues?, id?, currentUpdatedAt? }` error response shape used by sibling routers.

### 3.2 [ ] `GET /` and `GET /:id`
- `GET /` returns `{ goals: Goal[] }` (full list; no server-side filter).
- `GET /:id` returns goal or 404.
- Verify via curl.

### 3.3 [ ] `POST /` (create)
- Validate body with `GoalCreateSchema`. 409 on id collision; 201 on success.
- Verify via curl: success, validation 400, collision 409.

### 3.4 [ ] `PATCH /:id` (update)
- Validate body with `GoalUpdateSchema`; merge over stored row; re-validate merged record against `GoalSchema`.
- 409 stale-update if body's `updatedAt` is older than stored.
- 404 if missing; 400 on validation; 200 with full record on success.
- Verify via curl: success, validation, stale, not found.

### 3.5 [ ] `DELETE /:id`
- 204 on success; 404 if missing. Hard delete.

### 3.6 [ ] 405 catch-all for collection / unknown sub-paths.

---

## Phase 4: Dexie store + outbox wiring

**Dependencies:** Phase 1.

### 4.1 [ ] Add `goals` Dexie store to `src/client/db/forge-db.ts`
- Indexes: `id` (primary), `status`, `category`, `deadline`, `updatedAt`, `linkedExerciseId`, `linkedProgramRunId`.
- Bump Dexie version with an empty upgrade function.

### 4.2 [ ] Add Dexie helpers in `src/client/db/queries.ts`
- `listGoals()` (full table), `getGoal(id)`, `createGoal(goal)`, `updateGoal(id, patch)`, `deleteGoal(id)`.
- Each write helper performs Dexie write + `pending_writes` append in one transaction (`entity='goal'`, payloads per spec).
- Done when: each helper matches the equivalent `exercises.ts` helper signature.

### 4.3 [ ] Add Tanstack Query hooks
- `useGoals()`, `useGoal(id)`, `useCreateGoal()`, `useUpdateGoal()`, `useDeleteGoal()`.
- Use `useLiveQuery` for read hooks; mutation hooks invalidate `['goals']`.

### 4.4 [ ] Verify outbox flusher + reconcile handle `entity='goal'`
- Flusher dispatches to `/api/v1/goals/...` on `entity='goal'` outbox rows.
- Reconcile pull (`GET /api/v1/goals`) merges into Dexie with the established "outbox-pending wins locally" rule.
- No new code if dispatch is data-driven; otherwise add the `'goal'` arm.

---

## Phase 5: Progress helper + reconcile hook

**Dependencies:** Phase 4 + workout-sessions Phase covering session_set_logs Dexie store + programs Phase covering program_runs / program_run_day_states Dexie stores.

### 5.1 [ ] Implement `src/client/goals/progress.ts`
- `computeGoalProgress(goal, ctx)` per spec, with the four per-category arms.
- Reuse the exported `epley()` helper from workout-sessions; do not re-implement.
- `hasInsufficientData` flag returned when no contributing data.
- Done when: unit tests cover one happy and one empty/insufficient case per category.

### 5.2 [ ] Implement `src/client/goals/reconcile.ts`
- `reconcileGoals(finishedSessionId)` recomputes derived progress for active strength/cardio/program goals; flips `status` → `completed` and sets `completedAt` when threshold crosses; appends one `pending_writes` `update` entry per affected goal.
- Done when: unit test simulates a session finish that crosses one strength goal and verifies one Dexie update + one outbox entry.

### 5.3 [ ] Wire reconcile into the workout-sessions post-finish hook
- Extend the existing finish hook to call `reconcileGoals(sessionId)`.
- Done when: integration smoke-test from a running app shows goal status auto-flip after a qualifying session finish.

---

## Phase 6: `/goals` list page UI

**Dependencies:** Phases 4, 5.

### 6.1 [ ] Route + page shell at `/goals`
- Top bar: hamburger, amber **GOALS** title, `+` → `/goals/new`. Reuse `/exercises` shell components.

### 6.2 [ ] Filter chip row
- Two visual segments split by a `#26272A` divider: status chips (`Active` default · `Completed` · `All`) + category chips (`Strength` · `Cardio` · `Weight` · `Measurement` · `Program` · `Other`).
- Single-select per segment; tap-active to clear category. Reuse existing chip primitive.

### 6.3 [ ] Card list rendering
- Map filtered + sorted goals to cards.
- Card: category pill, title, countdown badge, big numerics line, amber progress bar with percent, started/target footer.
- Sort: `deadline` ASC nulls last, tiebreak `updatedAt` DESC; completed/abandoned after active in `All`/`Completed`.

### 6.4 [ ] URL state
- `?status=...&category=...` round-trip; defaults stripped.
- Back/forward and share preserve view.

### 6.5 [ ] Empty / no-match states
- Empty: full card with "No goals yet — set a target to start tracking." + `+ New goal` CTA.
- No match: dim line + `Clear filters` button.

### 6.6 [ ] Loading skeleton
- Three skeleton cards on initial mount.

---

## Phase 7: `/goals/:id` detail page UI

**Dependencies:** Phases 4, 5, 6.

### 7.1 [ ] Route + top bar
- Back arrow, `GOAL` muted label, kebab.
- Kebab items per spec; destructive items confirm.

### 7.2 [ ] Top progress card
- Oversized tabular numerics, amber progress bar with percent, single muted countdown + dates line.

### 7.3 [ ] Read-only form-field render
- Title, category, exercise/program link, start, target, deadline, notes, direction.
- Tap any row → `/goals/:id/edit`.

### 7.4 [ ] Inline `currentValue` edit (manual categories)
- Tap the numeric → numeric input + Save.
- On save: PATCH (Dexie + outbox); auto-completion when value crosses target (status → `completed`, `completedAt = now`).

### 7.5 [ ] Kebab actions
- Edit → navigate to edit route.
- Mark complete / Mark active toggle: PATCH `status` and `completedAt`.
- Abandon / Reactivate toggle: PATCH `status`.
- Delete: confirm dialog → Dexie delete + outbox → navigate to `/goals`.

### 7.6 [ ] Not-found fallback
- Render a "Goal not found" empty state when the id is missing in Dexie.

---

## Phase 8: `/goals/new` + `/goals/:id/edit` form UI

**Dependencies:** Phases 4, 7.

### 8.1 [ ] Shared form component at `src/client/pages/goals/form.tsx`
- Single source of truth for create + edit; accepts initial values + onSubmit.
- Sections per spec, in order: Type → Title → Start/Target → Linked exercise (conditional) → Linked program run (conditional) → Deadline → Notes → Direction (conditional).
- Submit button text driven by mode (`CREATE GOAL` vs `SAVE`).

### 8.2 [ ] Type segmented control
- Six options across two rows; selected option amber-filled.
- Selecting a category resets non-shared fields and re-renders.

### 8.3 [ ] Start / Target inputs + unit dropdown
- Numeric inputs for `Start` and `→ Target`, paired with a unit dropdown.
- Cardio time-under: `mm:ss` mask, no unit dropdown.
- Strength: `lb`/`kg` (default per global settings if available, else `lb`).
- Weight: `lb`/`kg`. Measurement: `in`/`cm`. Other: free-text 16-char unit input.
- Helper "Current: auto-filled from <exercise> PR" line where applicable.

### 8.4 [ ] Linked exercise picker (`strength`, `cardio` only)
- Outlined picker button; tap opens single-select sheet over Dexie `exercises`, filtered by type.
- Required for these categories.

### 8.5 [ ] Linked program run picker (`program` only)
- Outlined picker button; tap opens single-select sheet over Dexie `program_runs`.
- Required for `program`.

### 8.6 [ ] Deadline date field
- Calendar icon + native date picker.
- Constraint: must be > today.

### 8.7 [ ] Notes multiline
- Optional, sanity 4000-char cap.

### 8.8 [ ] Direction toggle (`other` only)
- Two-option toggle `Higher is better` / `Lower is better`. Locked elsewhere.

### 8.9 [ ] Submit + cancel
- Validate via `GoalCreateSchema` (or `GoalUpdateSchema` for edit).
- Disabled state until per-category required fields validate.
- Cancel: if dirty, confirm; otherwise navigate back.
- On submit: Dexie write + outbox append in one transaction; navigate back to list (create) or detail (edit).

### 8.10 [ ] `/goals/new` and `/goals/:id/edit` route wiring
- Two thin route components consume the shared form; `:id/edit` prefills from Dexie.

---

## Phase 9: Polish

**Dependencies:** Phases 6, 7, 8.

### 9.1 [ ] Countdown formatting
- `'X weeks left'` (≥14d), `'X days left'` (1–13), `'TODAY'`, muted-red `'OVERDUE'` when negative + active.
- Render `'COMPLETED'` / `'ABANDONED'` per status.

### 9.2 [ ] Auto-complete on `currentValue` save
- When the new value crosses target, status flips to `completed` and `completedAt = now` in the same transaction.

### 9.3 [ ] Stale-update conflict UX
- On 409 stale-update from PATCH, show a toast and re-pull the goal into Dexie.

### 9.4 [ ] A11y pass
- All interactive elements keyboard-reachable; chips and segmented controls expose role + selected state; date picker has accessible label.

### 9.5 [ ] Contrast audit
- Verify card surfaces, muted footer text, and amber progress bar meet AA contrast against `#0B0B0C` / `#17181A`.

---

## Phase 10: Manual verification

**Dependencies:** Phases 6, 7, 8, 9.

### 10.1 [ ] Visual diff against `design/goals-list.png`
- Confirm chip row layout (two segments, divider), card composition (category pill, title, countdown, numerics, progress bar, footer), spacing, dark-mode tokens.

### 10.2 [ ] Visual diff against `design/goal-form.png`
- Confirm segmented control (6 options across two rows), category-aware field visibility, large amber primary button, section grouping into subtle cards.

### 10.3 [ ] Round-trip create → edit → complete → delete
- One full happy-path lap per category, online and offline.

### 10.4 [ ] Reconcile-on-finish smoke
- Create a strength goal, log a session that crosses the target, finish → goal flips to `completed` with `completedAt` set; offline path queues the update and drains on reconnect.

### 10.5 [ ] Server pull merge
- Modify a goal directly in SQLite (or via curl), trigger reconcile pull → Dexie reflects the change unless an outbox entry exists for that id.

---

## Notes / pickup hints

- This slice's value-add is the **derived progress** model: adding columns to `goals` for cached `currentValue` is a tempting shortcut but breaks the "single source of truth" invariant established by sibling specs. Stick to the in-memory progress helper.
- The `mm:ss` cardio mask is the highest-friction UX detail; budget extra time on Phase 8.3 for that mode specifically.
- Per-category form mutation is the second-highest: a clean approach is a `useCategoryFields(category)` hook that returns the visible/required/forbidden field set, consumed once at the top of the form.
- The reconcile hook is the only cross-spec coupling; avoid putting goals-specific logic into workout-sessions code — call out from the existing post-finish hook only.
- Open items deferred from spec (cardio non-improving leg in `notes`, `other`-direction default, lifecycle of removed linked program runs) — leave as TODO comments at the relevant call sites; do not invent UX during implementation.
