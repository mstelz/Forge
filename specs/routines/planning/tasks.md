# Task Breakdown: Routines (Template Layer)

## Overview

The Routines slice is the second feature on top of Exercise Library and mirrors that slice's pattern exactly: shared Zod schemas first, then server (Drizzle + Hono), then client storage (Dexie + outbox extension), then UI (list -> builder), finishing with a polish pass and manual verification. The builder is the heaviest piece — it owns drag-to-reorder, an exercise picker reused from Exercise Library, and a prescription editor that toggles uniform-vs-per-set independently for `repMode`, `rpeMode`, and `setTypeMode`.

Total Tasks: ~58 across 10 phases.

Visual references:
- `/home/mike/Development/Forge/design/routine-builder.png` (authoritative for builder layout)

Authoritative spec: `/home/mike/Development/Forge/specs/routines/planning/spec.md`

Status legend: `[x]` done, `[~]` partial, `[ ]` not started.

---

## Phase 1: Shared Zod schemas + derived types

**Dependencies:** None. Every later phase imports from here.

### 1.1 [x] Define enums (`SetTypeEnum`, `BlockTypeEnum`, `ModeEnum`)
- `SetTypeEnum = z.enum(['normal','amrap','to_failure','drop_set','rest_pause'])`.
- `BlockTypeEnum = z.enum(['single','superset'])`.
- `ModeEnum = z.enum(['uniform','per_set'])`.
- Files: `src/shared/routine.ts` (new — colocate with rest of routine schemas) or extend `src/shared/enums.ts`.
- Done when: enums exported from `src/shared` barrel and importable client + server.

### 1.2 [x] Define `SetTargetSchema` + `RepTargetSchema` + `DurationTargetSchema`
- `SetTargetSchema`: `{ id: uuid, order: int >= 0, reps?, repsMin?, repsMax?, rpe?, setType: SetTypeEnum, techniqueNotes?: string().max(500).nullable() }` with cross-field rules (rep range vs single, half-step rpe, reps absent only if `setType` ∈ amrap/to_failure).
- `RepTargetSchema` and `DurationTargetSchema` per spec § Zod schemas.
- Half-step RPE via `.refine((n) => n * 2 === Math.round(n * 2))`.
- Files: `src/shared/routine.ts`.
- Depends on: 1.1.

### 1.3 [x] Define `RoutineItemSchema` (prescription payload)
- Fields per spec: `id`, `exerciseId` (uuid), `order`, `setCount` (1–20), `repMode`/`rpeMode`/`setTypeMode`, uniform fields (`uniformReps`, `uniformRepsMin`, `uniformRepsMax`, `uniformRpe`, `uniformSetType`), `setTargets?: SetTargetSchema[]`, `durationSec?`, `durationMinSec?`, `durationMaxSec?`, `notes?` (max 1000, nullable).
- `superRefine` enforces every gating rule from spec § Validation rules:
  - mode flag x field-presence matrix
  - `setTargets` present iff any mode is `per_set`; length === `setCount`; dense `order`
  - When `setTypeMode='uniform'` each `setTargets[i].setType === uniformSetType`
- Files: `src/shared/routine.ts`.
- Depends on: 1.2.

### 1.4 [x] Define `RoutineBlockSchema`
- `{ id, type: BlockTypeEnum, order, roundCount?, restSec? (0–3600), tempo? (max 20), notes? (max 1000), items: RoutineItemSchema[] }`.
- `superRefine` enforces:
  - `type='single'` → `items.length === 1` and `roundCount` null
  - `type='superset'` → `items.length` ∈ [2,6] and `roundCount` ∈ [1,20]
  - Item `order` dense `0..M-1`
- Files: `src/shared/routine.ts`.
- Depends on: 1.3.

### 1.5 [x] Define `RoutineSchema` + `RoutineCreateInput` + `RoutineUpdateInput`
- `RoutineSchema`: `{ id, name: trim().min(1).max(100), notes? (max 2000, nullable), estimatedDurationMin? (1–600 int, nullable), blocks: RoutineBlockSchema[], createdAt, updatedAt }`.
- Top-level `superRefine` enforces dense block `order` `0..N-1`.
- `RoutineCreateInput` omits/optional-izes timestamps; `RoutineUpdateInput` is the full record (no patch shape).
- Done when: spec's example payload (spec.md lines 184–235) parses cleanly and a malformed variant is rejected with a meaningful issue path.
- Files: `src/shared/routine.ts`.
- Depends on: 1.4.

### 1.6 [x] Extend `PendingWriteSchema` entity union to include `'routine'`
- Add `'routine'` to the `entity` enum in `src/shared/pending-write.ts`. Payload remains `z.unknown()`.
- Done when: existing exercise/equipment outbox writes still type-check, and routine entries can be enqueued.
- Files: `src/shared/pending-write.ts`.
- Depends on: 1.5.

### 1.7 [x] Re-export from `src/shared` barrel
- Add routine schema + type re-exports to `src/shared/index.ts` so `import { RoutineSchema, type Routine } from '@/shared'` works from client and server.
- Files: `src/shared/index.ts`, `src/shared/types.ts`.
- Depends on: 1.5, 1.6.

**Acceptance Criteria (Phase 1):** Schemas parse the spec's example payload and reject the documented invariant violations (mismatched `setTargets.length`, wrong mode/field combos, single block with 2 items, superset with 1 item, range without min<=max, half-step rpe violation). No references to Dexie/Drizzle/Hono in `src/shared`.

---

## Phase 2: Database (Drizzle schema + migration)

**Dependencies:** Phase 1.

### 2.1 [ ] Add `routines` Drizzle table
- Columns: `id` (text PK), `name` (text NN), `notes` (text), `estimatedDurationMin` (int), `createdAt`, `updatedAt` (`integer` `timestamp_ms`, NN).
- Indexes: `idx_routines_name` on `name`, `idx_routines_updated_at` on `updatedAt`.
- Files: `src/db/schema.ts`.

### 2.2 [ ] Add `routine_blocks` Drizzle table
- Columns per spec § Drizzle tables. FK `routineId` → `routines.id` with `onDelete: 'cascade'`.
- `type` text, `roundCount` int, `restSec` int, `tempo` text, `notes` text, `order` int NN.
- Index: `idx_routine_blocks_routine_order` on `(routineId, order)`.
- Files: `src/db/schema.ts`.

### 2.3 [ ] Add `routine_items` Drizzle table
- Columns: `id`, `blockId` (FK cascade), `routineId` (FK cascade, denormalized), `order`, `exerciseId` (text — soft reference, NO FK constraint, mirroring exercise.equipmentIds tolerance), `setCount`, `repMode`, `rpeMode`, `setTypeMode`, all `uniform*` fields, `durationSec`, `durationMinSec`, `durationMaxSec`, `notes`.
- Indexes: `idx_routine_items_block_order` on `(blockId, order)`, `idx_routine_items_routine` on `routineId`, `idx_routine_items_exercise` on `exerciseId`.
- Files: `src/db/schema.ts`.

### 2.4 [ ] Add `routine_set_targets` Drizzle table
- Columns: `id`, `itemId` (FK cascade), `routineId` (FK cascade, denormalized), `order`, `reps`, `repsMin`, `repsMax`, `rpe` (real), `setType` text NN, `techniqueNotes` text.
- Index: `idx_routine_set_targets_item_order` on `(itemId, order)`.
- Files: `src/db/schema.ts`.

### 2.5 [ ] Generate and commit Drizzle migration
- Run `bun run db:generate`; verify generated SQL creates all four tables, FKs cascade correctly, and indexes exist.
- Done when: `bun run db:migrate` runs cleanly against a fresh `./data/forge.db` containing the existing exercise/equipment tables.
- Files: `src/db/migrations/<timestamp>_*.sql` (generated).
- Depends on: 2.1–2.4.

**Acceptance Criteria (Phase 2):** Fresh DB migrates without error; the four routine tables exist with cascade FKs and required indexes; existing exercise/equipment tables remain intact.

---

## Phase 3: API (Hono routes + Zod validation)

**Dependencies:** Phase 1, Phase 2.

### 3.1 [ ] Scaffold `/api/v1/routines` sub-router
- Create `src/server/routes/routines.ts` as a Hono sub-router; mount from `src/server/routes/api.ts` under `/routines`.
- Done when: `GET /api/v1/routines` returns `200 { routines: [] }` against an empty DB.
- Files: `src/server/routes/api.ts`, `src/server/routes/routines.ts` (new).

### 3.2 [ ] Implement a `loadRoutine(id)` server-side helper
- Joins `routines` + `routine_blocks` + `routine_items` + `routine_set_targets` and returns the nested Zod-shaped `Routine`. Sorts blocks/items/setTargets by `order`.
- Files: `src/server/routes/routines.ts`, optionally `src/server/lib/routine-loader.ts` (new).
- Depends on: 3.1.

### 3.3 [ ] Implement Routines GET routes
- `GET /routines` → `200 { routines: Routine[] }` (uses 3.2 per row).
- `GET /routines/:id` → `200 Routine` | `404 { error: 'not_found' }`.
- Done when: both endpoints return correctly-shaped nested payloads.
- Depends on: 3.2.

### 3.4 [ ] Implement `POST /routines`
- Body validated with `RoutineCreateInput`. Run a single SQLite transaction inserting the routine + blocks + items + set targets. On top-level id collision return `409 { error: 'id_conflict', id }`. `400` on Zod failure.
- Server bumps timestamps if absent: `createdAt = updatedAt = Date.now()` when missing; preserves client value otherwise.
- Done when: 201 with the canonical loaded routine; duplicate POST returns 409.
- Depends on: 3.3.

### 3.5 [ ] Implement `PATCH /routines/:id` (full-document replace)
- Body validated with `RoutineUpdateInput`. In a single transaction: assert routine exists (404 if not); delete existing `routine_blocks` (cascades to items/set_targets); re-insert from payload; update `routines` row; bump `updatedAt = max(body.updatedAt, Date.now())`.
- 200 with reloaded nested payload; 400 on validation; 404 if missing.
- Soft-warn (do not reject) when `exerciseId`s don't exist — same convention as Exercise Library's `equipmentIds`.
- Depends on: 3.4.

### 3.6 [ ] Implement `DELETE /routines/:id`
- 204 on success or if already gone (idempotent). FK cascades clean up children.
- Depends on: 3.3.

### 3.7 [ ] Reuse error helper from `src/server/lib/errors.ts`
- All routes return `{ error, issues?, id? }` with appropriate status codes per Exercise Library convention.
- Files: `src/server/routes/routines.ts`.
- Depends on: 3.1.

**Acceptance Criteria (Phase 3):** All endpoints return spec-conformant status codes and bodies; PATCH replaces children transactionally; manual `curl` exercises each route family successfully against the dev server (`bun run dev`, port 8080).

---

## Phase 4: Client storage (Dexie store + outbox + repository + hooks)

**Dependencies:** Phase 1, Phase 3.

### 4.1 [ ] Add `routines` Dexie store (schema bump)
- Bump `forge-db.ts` to a new Dexie version; add `routines` store with `keyPath: 'id'` and indexes on `name`, `updatedAt`.
- Each Dexie row stores the full nested routine document (whole-document mirror, matching Exercise Library convention).
- Files: `src/client/db/forge-db.ts`.

### 4.2 [ ] Implement transactional routine write helpers
- `createRoutine(routine)`, `updateRoutine(routine)`, `deleteRoutine(id)`. Each runs ONE Dexie transaction touching `routines` + `pendingWrites`. Payload for create/update is the full nested document; payload for delete is `{ id }`. `entity = 'routine'`.
- Files: `src/client/db/mutations.ts` (extend).
- Depends on: 4.1.

### 4.3 [ ] Implement Dexie read helpers + query keys
- `listRoutines()`, `getRoutineById(id)`. Add to `query-keys.ts`.
- Files: `src/client/db/queries.ts`, `src/client/db/query-keys.ts`.
- Depends on: 4.1.

### 4.4 [ ] Wire routine entity into the existing flusher
- Extend `src/client/sync/flusher.ts` so `entity='routine'` dispatches against `/api/v1/routines` with the same FIFO + retry/backoff loop. Status code handling identical to exercises:
  - create 201 → drop entry; 409 id_conflict → log + drop
  - update 200 → drop; 404 → drop (treated as gone)
  - delete 204 → drop
- Done when: a manually-enqueued routine create drains against a running server.
- Files: `src/client/sync/flusher.ts`.
- Depends on: 4.2, Phase 3.

### 4.5 [ ] Wire routine entity into reconcile (pull)
- Extend `src/client/sync/reconcile.ts` to GET `/api/v1/routines` and apply the same merge rules as Exercise Library: local wins for any id with a pending outbox entry; otherwise server replaces local; missing locals get added; locals not on server with no pending `create` get removed.
- Files: `src/client/sync/reconcile.ts`.
- Depends on: 4.4.

### 4.6 [ ] Tanstack Query hooks
- `useRoutines()` and `useRoutine(id)` reading from Dexie via `useLiveQuery` under the hood, mirroring `useExercises`/`useExercise` shape.
- Files: `src/client/hooks/use-routines.ts` (new).
- Depends on: 4.3.

**Acceptance Criteria (Phase 4):** A console-driven `createRoutine(...)` writes a Dexie row + outbox entry atomically; flusher drains it against a running server and removes the entry on 201; reconcile after server-side mutation pulls updated payload without clobbering pending local writes.

---

## Phase 5: List page (`/routines`)

**Dependencies:** Phase 4.

### 5.1 [ ] Register routes + page skeleton
- Add `/routines`, `/routines/new`, `/routines/:id` to the router (`src/client/main.tsx` or wherever routes live alongside `/exercises`).
- Top bar: hamburger, "Routines" title, `+` action linking to `/routines/new`. Add drawer-nav entry "Routines".
- Files: `src/client/pages/routines/list.tsx` (new), router config, drawer component.

### 5.2 [ ] Search input
- Full-width input with placeholder `Search routines`. Case-insensitive substring over `name`. Trimmed. Visually-hidden label + `aria-label`.
- Files: `src/client/pages/routines/search.tsx` (new) or inline.
- Depends on: 5.1.

### 5.3 [ ] Dense routine row component
- Bold `name`, muted secondary line `<N> blocks · ~<estimatedDurationMin> min` (gracefully omit `~M min` when null; collapse the separator).
- Right-side overflow menu: Edit (→ `/routines/:id`) and Delete (opens confirm dialog).
- Single focusable Link wrapping the body.
- Files: `src/client/pages/routines/row.tsx` (new).
- Depends on: 5.1.

### 5.4 [ ] Filter + sort pipeline (search + alpha sort)
- Memoized selector: trim + lowercase search, substring match on `name`, then sort by `name` ASC, locale-aware. No filter chips in this slice.
- Files: `src/client/pages/routines/use-filtered-routines.ts` (new).
- Depends on: 5.2.

### 5.5 [ ] Empty + zero-match + loading states
- Loading: skeleton rows during first Dexie read.
- Full-empty: centered "No routines yet" + create CTA routing to `/routines/new`.
- Zero-match: inline "No matches" row with "Clear search" button.
- Files: `src/client/pages/routines/empty-states.tsx` (new) or inline.
- Depends on: 5.4.

### 5.6 [ ] Delete confirmation flow on the list
- Radix Dialog confirming destructive delete; on confirm call `deleteRoutine(id)` (Dexie + outbox).
- Files: `src/client/pages/routines/delete-dialog.tsx` (new).
- Depends on: 4.2, 5.3.

**Acceptance Criteria (Phase 5):** List renders dense rows from Dexie sorted alphabetically; search filters live; Delete from row overflow round-trips offline; empty/zero-match/loading states behave per spec.

---

## Phase 6: Builder shell + exercise picker reuse

**Dependencies:** Phase 5, Exercise Library Phase 6 search/filter primitives.

### 6.1 [ ] Builder page skeleton + routes
- `/routines/new` renders `<RoutineBuilderPage mode="create" />`; `/routines/:id` renders `<RoutineBuilderPage mode="edit" />`.
- Top bar: back arrow with dirty-state guard, title (`New routine` / `Edit routine`), prominent amber `Save` button.
- Local builder state via `useReducer` (or a small Zustand store) holding the in-progress nested routine document. Initialize empty for create, prefill from `useRoutine(id)` for edit.
- 404 state if `:id` not in Dexie.
- Files: `src/client/pages/routines/builder/index.tsx` (new), `src/client/pages/routines/builder/state.ts` (new).

### 6.2 [ ] Routine header card
- Inline-edit `name` (bold, large, required 1–100 chars).
- `~<estimatedDurationMin> min` chip with tap-to-edit numeric input (1–600).
- `notes` line tap-to-edit (max 2000 chars, placeholder `Add notes about this session…`).
- Drop the `Upper` chip — explicitly out of scope.
- Files: `src/client/pages/routines/builder/header-card.tsx` (new).
- Depends on: 6.1.

### 6.3 [ ] Lift exercise picker from `/exercises` into a reusable component
- Extract list page primitives (search input, type chips, muscle chips, equipment multi-select sheet, dense row) into a shared `<ExercisePicker />` component (modal/sheet) under `src/client/pages/exercises/picker.tsx` (new) or `src/client/components/exercise-picker.tsx`.
- Reads from Dexie `exercises` directly (offline-capable). Single-select callback `onSelect(exerciseId)`.
- Refactor `src/client/pages/exercises/list.tsx` to consume the same primitives so behavior stays in lockstep.
- No "Create new exercise" inline affordance in v1.
- Files: `src/client/components/exercise-picker.tsx` (new), refactor of `src/client/pages/exercises/list.tsx`.
- Depends on: 6.1.

### 6.4 [ ] Save + Discard wiring
- Save: run client-side Zod validation against `RoutineCreateInput`/`RoutineUpdateInput`; normalize `order` densely on blocks, items, and set targets; assign UUIDs to any new entities; on success call `createRoutine`/`updateRoutine` and navigate back to `/routines`. On Zod failure surface field errors in a top-of-form error region.
- Discard: dirty-state guard prompts a confirm dialog when leaving with unsaved changes (back arrow, browser back, drawer nav). React Router `useBlocker` or equivalent.
- Files: `src/client/pages/routines/builder/save.ts` (new), `builder/discard-guard.tsx` (new).
- Depends on: 6.1, 4.2.

**Acceptance Criteria (Phase 6):** Builder loads empty for create, prefilled for edit; save persists offline and navigates back; dirty-state guard fires on unsaved leaves; the exercise picker works inside the builder reading Dexie.

---

## Phase 7: Builder block list + drag-to-reorder

**Dependencies:** Phase 6.

### 7.1 [ ] Pick d&d library (pointer + touch)
- Confirm whether Exercise Library introduced one. If not, install `@dnd-kit/core` + `@dnd-kit/sortable` (both pointer + touch via `PointerSensor` + `TouchSensor`). Document the choice in a top-of-file comment.
- Files: `package.json`, `src/client/pages/routines/builder/dnd.ts` (new).

### 7.2 [ ] Block list shell with drag handles
- Render blocks vertically in `<SortableContext>`. Each block has a six-dot left drag handle. Reorder updates `order` densely on drop.
- Files: `src/client/pages/routines/builder/block-list.tsx` (new), `block-row.tsx` (new).
- Depends on: 7.1.

### 7.3 [ ] Single-exercise block row (collapsed summary)
- Compact summary line: `<setCount> × <repsSummary> · RPE <rpeSummary> · <restMmSs> rest`.
  - `repsSummary`: number, `min–max`, or `AMRAP` / `To failure` when applicable.
  - `rpeSummary`: numeric or `—` when absent.
- Inline `setType !== 'normal'` chip (e.g., `AMRAP LAST SET`, `DROP SET`, `REST-PAUSE`) per spec.
- Edit pencil + chevron expand affordance + overflow menu (Delete).
- Cardio/Mixed variant: summary `<duration> · Mixed` with runner glyph; surfaces `notes` distance/pace text when present.
- Files: `src/client/pages/routines/builder/single-block.tsx` (new), `summary.ts` (new helper).
- Depends on: 7.2.

### 7.4 [ ] Superset block row (collapsed summary, items-within drag)
- Colored amber left accent bar; header `SUPERSET <letter>` (auto A/B/C by superset order among siblings).
- Block-level inline-edit `roundCount` (1–20) and `restSec` (mm:ss).
- Items rendered inside a nested `<SortableContext>` scoped to `blockId`; each item has its own drag handle. Items: 2–6.
- Each item shows a compact summary + chevron-to-expand. Item-delete is disabled when only 2 items remain (prevents <2).
- Cross-block item drags are disabled in v1.
- Files: `src/client/pages/routines/builder/superset-block.tsx` (new), `superset-item-row.tsx` (new).
- Depends on: 7.2.

### 7.5 [ ] Add affordances
- Inline `+ ADD BLOCK` between blocks and at end. Tapping prompts which type or routes to bottom-bar action — keep simple: render the bottom bar's `+ Add exercise` / `Add superset` actions instead, and optionally an inline `+` between blocks that opens the picker for a single.
- Sticky bottom action bar with two equal buttons:
  - `+ Add exercise` → creates a `single` block, opens picker, inserts selected exercise as the lone item (with default prescription: `setCount=3`, all modes uniform, `uniformReps=10`, `uniformSetType='normal'`).
  - `Add superset` (chain icon) → creates an empty `superset` block with `roundCount=3`, opens picker for the first item, then prompts for the second.
- Files: `src/client/pages/routines/builder/add-bar.tsx` (new), `inline-add-block.tsx` (new).
- Depends on: 6.3, 7.3, 7.4.

### 7.6 [ ] Replace exercise affordance per item
- Inside an item's expanded editor, a `Replace exercise` button reopens the picker and swaps `exerciseId`.
- Files: extends 7.3/7.4 components.
- Depends on: 6.3.

**Acceptance Criteria (Phase 7):** Block list reorders via drag on pointer + touch; superset items reorder within their parent; cross-block drags rejected; add-affordances create the right block shape with sane defaults; collapsed rows match mockup density and display setType chips correctly.

---

## Phase 8: Prescription editor (expanded row)

**Dependencies:** Phase 7.

### 8.1 [ ] Expanded item editor shell
- Tap chevron/pencil on a row → expand inline into the prescription editor. Collapse button re-renders the summary.
- Files: `src/client/pages/routines/builder/prescription-editor.tsx` (new).

### 8.2 [ ] Set count stepper
- Numeric stepper, range 1–20. Hidden when the parent block is a `superset` (block-level `roundCount` governs).
- Resize semantics: when growing in any per-set mode, append entries by cloning the LAST existing entry's values; when shrinking, truncate trailing entries. Silent (no toast/prompt). Implemented as a deterministic helper.
- Files: `src/client/pages/routines/builder/fields/set-count.tsx` (new), `src/client/pages/routines/builder/resize-set-targets.ts` (new).
- Depends on: 8.1.

### 8.3 [ ] Three independent mode toggles (`repMode`, `rpeMode`, `setTypeMode`)
- Three segmented controls (`role="radiogroup"`), each `Uniform | Per set`. Switchable independently.
- Mode change semantics:
  - `uniform → per_set` for any axis: clone the uniform value across `setCount` entries (preserve other axes' existing values where possible).
  - `per_set → uniform` for any axis: collapse to the first entry's value (silent).
  - When all three modes return to `uniform`, drop `setTargets` from the in-memory document.
  - When at least one mode is `per_set`, ensure `setTargets` exists with length === `setCount` and dense `order`.
- Files: `src/client/pages/routines/builder/fields/mode-toggles.tsx` (new), `src/client/pages/routines/builder/mode-transitions.ts` (new).
- Depends on: 8.2.

### 8.4 [ ] Uniform reps input (single value vs range toggle)
- When `repMode='uniform'`: numeric input for `uniformReps` with toggle to range (`uniformRepsMin` / `uniformRepsMax`). Validate `min <= max`, both 1–999.
- May be omitted entirely when `setTypeMode='uniform'` and `uniformSetType` ∈ `amrap`/`to_failure`.
- Files: `src/client/pages/routines/builder/fields/uniform-reps.tsx` (new).
- Depends on: 8.3.

### 8.5 [ ] Uniform RPE input
- When `rpeMode='uniform'`: single numeric input, 1.0–10.0, half-step (`x.0` or `x.5`). Optional. Hidden when `rpeMode='per_set'`.
- Files: `src/client/pages/routines/builder/fields/uniform-rpe.tsx` (new).
- Depends on: 8.3.

### 8.6 [ ] Uniform setType selector
- When `setTypeMode='uniform'`: single enum selector applied to all sets — `Normal | AMRAP | To failure | Drop set | Rest-pause` (mutually exclusive). Required when this mode is uniform.
- Files: `src/client/pages/routines/builder/fields/uniform-set-type.tsx` (new).
- Depends on: 8.3.

### 8.7 [ ] Per-set table
- Rendered when ANY mode is `per_set`. Compact table with one row per set; columns conditional on which axes are `per_set`:
  - `reps` column (single or range toggle per row) when `repMode='per_set'`
  - `rpe` numeric input when `rpeMode='per_set'`
  - `setType` selector when `setTypeMode='per_set'`
- Each row has a chevron-expand for an inline `techniqueNotes` textarea (max 500 chars).
- Reps may be absent on a row when its `setType` is `amrap`/`to_failure` (validation gating).
- Files: `src/client/pages/routines/builder/fields/per-set-table.tsx` (new), `per-set-row.tsx` (new).
- Depends on: 8.3.

### 8.8 [ ] Rest input (mm:ss)
- Block-level `restSec` editor on the block header. Free-form text input parses `mm:ss` (`90` → 1:30 also accepted? — strict `mm:ss` per spec; "90s" not parsed). Validate 0–3600 inclusive.
- For `single` blocks: applied between sets. For `superset`: per round.
- Files: `src/client/pages/routines/builder/fields/rest.tsx` (new), `mmss.ts` (new helper for parse/format).
- Depends on: 7.3, 7.4.

### 8.9 [ ] Tempo input
- Free-form text input on the block header (max 20 chars). Hint text: `eccentric-bottom-concentric-top` (e.g., `3-1-1-0`).
- Files: `src/client/pages/routines/builder/fields/tempo.tsx` (new).
- Depends on: 7.3.

### 8.10 [ ] Duration inputs
- mm:ss inputs for `durationSec` with toggle to range (`durationMinSec` / `durationMaxSec`), reusing the mm:ss helper. Validate 1–86400 and `min <= max`.
- Always shown when the linked exercise is `cardio` or `mixed` (read `type` from Dexie); hidden for pure `strength`. Mixed exercises render BOTH rep and duration sections; user fills what applies.
- Files: `src/client/pages/routines/builder/fields/duration.tsx` (new).
- Depends on: 8.1.

### 8.11 [ ] Item-level notes textarea
- Free-form multiline up to 1000 chars. Absorbs distance/pace text in v1.
- Files: `src/client/pages/routines/builder/fields/item-notes.tsx` (new).
- Depends on: 8.1.

### 8.12 [ ] Block-level notes textarea
- Optional block-level `notes` textarea (max 1000 chars), surfaced under the block header alongside rest/tempo.
- Files: `src/client/pages/routines/builder/fields/block-notes.tsx` (new).
- Depends on: 7.3, 7.4.

**Acceptance Criteria (Phase 8):** Each axis (reps / rpe / setType) toggles independently; per-set table appears iff any axis is `per_set`; setCount resize clones / truncates silently; mm:ss inputs round-trip cleanly; mixed exercises show both rep and duration sections; setType selector remains mutually exclusive on every row.

---

## Phase 9: Polish (validation, empty states, error UX, missing-exercise placeholder)

**Dependencies:** Phases 5–8.

### 9.1 [ ] Inline validation messages on Save
- Map Zod `issues` paths (e.g., `blocks.1.items.0.uniformReps`) to specific field error rendering inside the builder. Show a sticky top error banner with a count when multiple errors exist; clicking banner scrolls to first invalid field.
- Files: `src/client/pages/routines/builder/validation.tsx` (new), updates to existing field components.

### 9.2 [ ] "Missing exercise" placeholder
- When an item's `exerciseId` no longer exists in Dexie (cross-spec deletion), render the row with a muted "Missing exercise" label and a `Replace` action that opens the picker. Persist unchanged otherwise.
- Files: `src/client/pages/routines/builder/missing-exercise.tsx` (new), updates to single-block / superset-item-row.

### 9.3 [ ] Loading + error UX for builder
- Skeleton block list while Dexie read is in flight (edit mode); failed reads show a graceful fallback paragraph with retry.
- Files: `src/client/pages/routines/builder/index.tsx`.

### 9.4 [ ] Empty / draft states
- Builder with zero blocks: render a centered hint "Add an exercise or a superset to get started" above the bottom bar. Save remains enabled (zero-block routines are valid per Zod) but a soft warning chip suggests adding at least one block.
- Files: `src/client/pages/routines/builder/empty-state.tsx` (new).

### 9.5 [ ] Outbox failure surface (reuse Exercise Library banner)
- Reuse the global outbox-error banner from Exercise Library Phase 10; verify it covers `entity='routine'` failures (no new banner needed).
- Files: `src/client/sync/flusher-banner.tsx` (verify).

### 9.6 [ ] A11y sweep
- Verify: drag handles have `aria-label` and keyboard reorder fallback (dnd-kit's keyboard sensor); mode toggles use `role="radiogroup"`; per-set table has proper `<th>`/`<td>` semantics; chevron expand uses `aria-expanded`; mm:ss inputs have `aria-describedby` hint; modal/sheet picker traps focus.
- Files: any components missing a11y wiring.

### 9.7 [ ] Dirty-state guard copy + edge cases
- Confirm-discard dialog wording: "Discard unsaved changes?" with `Keep editing` / `Discard`. Bypass when there are no diffs from Dexie source-of-truth (deep equality on the in-memory document vs initial snapshot).
- Files: `src/client/pages/routines/builder/discard-guard.tsx`.

**Acceptance Criteria (Phase 9):** Every Zod rule surfaces as a readable inline error; missing exercises don't crash the builder; keyboard-only navigation reaches every editable field; outbox errors are visible.

---

## Phase 10: Manual verification against mockup

**Dependencies:** All prior phases.

### 10.1 [ ] Manual test checklist
Run `bun run dev` and step through every flow with `design/routine-builder.png` open side-by-side:

- [ ] First launch with empty Dexie: `/routines` shows "No routines yet" with create CTA.
- [ ] Tap `+` → `/routines/new` → builder loads empty with name placeholder, bottom bar visible, no blocks.
- [ ] Add a single-exercise block (Barbell Bench Press) with `4 × 5 · RPE 8 · 2:30 rest`. Summary line visually matches mockup.
- [ ] Add a superset (Incline DB Press 3×10, Cable Fly 3×12) with 90s/60s round rest; left amber accent + `SUPERSET A` header render.
- [ ] Add a tricep pushdown block with 3 sets, `setTypeMode='per_set'`: sets 1–2 normal 12 reps, set 3 AMRAP no reps. `AMRAP LAST SET` chip surfaces inline on the row summary per mockup.
- [ ] Add a treadmill cardio block: `10 min · Mixed` summary with runner glyph; notes field holds `3.5 mph @ 8% incline` text.
- [ ] Drag-reorder blocks via the left handle on pointer (mouse) AND touch (devtools touch emulation). Order persists.
- [ ] Drag-reorder items inside the superset; cross-block drags are blocked.
- [ ] Toggle `repMode`, `rpeMode`, `setTypeMode` independently inside the pushdown block; per-set table appears iff any axis is `per_set`; setCount resize clones last entry then truncates trailing entries silently when reduced.
- [ ] mm:ss rest input parses `2:30` → 150s and renders back as `2:30`.
- [ ] Save → navigates to `/routines`; row shows `4 blocks · ~52 min`. Outbox has exactly one `routine.create` entry; flusher drains it against the running server.
- [ ] Reload `/routines/<id>` (edit mode); builder prefills with the saved document; modify name; Save enqueues a `routine.update` entry.
- [ ] Go offline (devtools Offline). Edit a routine; outbox accumulates one update entry; go online → drains.
- [ ] Delete a routine from list overflow → confirm → row gone; outbox has one delete entry; server cascade-deletes blocks/items/setTargets.
- [ ] Open the builder, dirty the form, hit back arrow → confirm-discard dialog; choose `Keep editing` to stay; choose `Discard` to leave without saving.
- [ ] Delete an exercise from `/exercises` that's referenced by a routine; reopen the routine — the item renders as `Missing exercise` with a `Replace` action that opens the picker.
- [ ] Keyboard-only: tab through builder; expand a row with Enter; navigate per-set table cells; toggle modes via arrow keys on segmented controls; reorder a block with the dnd-kit keyboard sensor.
- [ ] Refresh mid-outbox with server down: pending entries persist and flush when server returns.

**Acceptance Criteria (Phase 10):** Every checklist item passes; the builder visually matches `design/routine-builder.png` in structure, density, and accent treatment; offline writes survive refresh and drain on reconnect.

---

## Execution Order (recommended)

1. Shared schemas (Phase 1)
2. Drizzle schema + migration (Phase 2)
3. Hono routes (Phase 3)
4. Dexie store + outbox extension + repository + hooks (Phase 4)
5. List page (Phase 5)
6. Builder shell + reusable exercise picker (Phase 6)
7. Block list + drag-to-reorder (Phase 7)
8. Prescription editor (Phase 8)
9. Polish (Phase 9)
10. Manual verification against mockup (Phase 10)
