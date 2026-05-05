# Specification: Routines (Template Layer)

## Overview

This slice introduces the **routine template / planning layer** to Forge. A routine is a reusable workout template — a named, ordered list of blocks (single-exercise or superset), each holding ordered items that reference exercises from the library and carry structured prescription metadata (sets, rep mode, rep targets/ranges, RPE, rest, tempo, technique modifiers, duration targets, notes). Templates describe **intent**; live session execution is a separate, future slice and is explicitly excluded here.

The routine layer is the second feature built on the foundation laid by Exercise Library. It mirrors that pattern exactly: Drizzle tables in `src/db`, Zod schemas in `src/shared`, Hono CRUD routes in `src/server`, a Dexie mirror in `src/client`, and write fanout through the generic `pending_writes` outbox. Reads come from Dexie via Tanstack Query; writes go to Dexie + outbox in one transaction; a background flusher drains against `/api/v1/routines`. The builder UI matches `design/routine-builder.png` in structure and density.

## Goals

- Let the single user create, browse, edit, reorder, and delete routines fully offline.
- Capture **structured** prescription data (no fragile single-string `repScheme`): set count, rep mode, rep targets/ranges, RPE, rest, tempo, technique flags, duration targets, and per-set targets when custom mode is enabled.
- Support `single` and `superset` blocks with single-layer nesting only, including drag-to-reorder of blocks and items-within-superset on desktop and touch.
- Reuse the Exercise Library Dexie cache as the source for the in-builder exercise picker, so the builder stays offline-capable.
- Match `design/routine-builder.png` in layout, density, and progressive-disclosure behavior.

## Non-goals (v1)

- Live workout sessions, the logger, mutable execution state, session hydration.
- Programs, workout history, goals, calendar/scheduling.
- Routine version history table — routines are mutable in place; sessions (future slice) snapshot intent at log time.
- Bearer-token auth on `/api/v1/routines`. **Explicit divergence from PRD** ("bearer token in v1") per user direction; deferred to a later slice.
- Structured technique payloads beyond the `setType` enum + free-form `techniqueNotes` (no drop-weight arrays, no pause-duration fields).
- Structured distance/pace targets — captured as free text in `notes` for v1.
- Stackable technique modifiers — exactly one `setType` per set.
- Nested supersets (circuits, AMRAP rounds-of-rounds, etc.).
- Filter chips on the list page beyond name search and alphabetical sort.
- Routine category/tag chips ("Upper", "Push", etc.) — the `Upper` chip in the mockup is explicitly dropped.
- Routine-level `lastUsedAt` / usage stats — derived from sessions later.
- Bulk import/export, bulk API endpoints, copy/duplicate of routines.

## User flows

1. **Browse routines.** User opens `/routines` → list renders dense rows from Dexie sorted alphabetically. User types in the search field; results filter live by `name` substring (case-insensitive, trimmed).
2. **Create.** Tap `+` in top bar → `/routines/new` → empty builder loads with a placeholder name. User edits name, taps **Add exercise** or **Add superset**, picks exercises from the modal/sheet picker (reads Dexie exercise cache, reuses `/exercises` search/filter semantics), and edits prescription per block. Tap **Save** → Dexie write + outbox append in one transaction → navigate back to `/routines`.
3. **Edit.** Tap a row → `/routines/:id` builder loads, prefilled. Same UX as create. **Save** writes to Dexie + enqueues an `update` outbox entry → navigate back to list. Edits mutate the routine in place; no version history.
4. **Reorder.** Within the builder, drag the handle on a block to reorder it among siblings; drag an item inside a superset to reorder within that superset. Works on desktop pointer and touch.
5. **Add/remove blocks and items.** `+ ADD BLOCK` between blocks and at the end; bottom bar with **+ Add exercise** (creates `single` block) and **Add superset** (creates empty `superset` block, then opens picker for first item). Overflow menu on a block/item exposes Delete.
6. **Edit prescription.** Default row shows compact summary (e.g., `4 × 5 · RPE 8 · 2:30 rest`). Tap pencil/chevron to expand the row into the prescription editor (set count, rep mode toggle, uniform-vs-per-set fields, technique selector, duration fields when applicable). Collapsing re-renders the summary.
7. **Delete a routine.** From list row overflow or builder overflow → confirm → Dexie delete (cascades to blocks, items, set targets) + outbox enqueues delete → navigate to list.
8. **Back online.** Outbox flusher drains routine writes the same way it drains exercise/equipment writes. No new flusher logic required.

## Data model

All IDs are client-generated UUIDv4. Client-supplied IDs are accepted on `POST` and `PATCH`; server returns **409 Conflict** on top-level routine ID collision. Block, item, and set-target IDs are owned by their parent routine and are replaced wholesale on `PATCH` (no per-child collision check needed because they are scoped to a routine that is being fully overwritten).

### Drizzle tables (`src/db/schema.ts`, SQLite via `bun:sqlite`)

The server stores routines in a normalized 4-table shape so blocks, items, and per-set targets are queryable, but the API boundary always exposes a nested whole-document payload (see [API contract](#api-contract)).

**`routines`**
- `id` — `text` primary key (UUID)
- `name` — `text` not null
- `notes` — `text` nullable
- `estimatedDurationMin` — `integer` nullable (user-entered minutes; not derived)
- `createdAt` — `integer` (timestamp_ms) not null
- `updatedAt` — `integer` (timestamp_ms) not null
- Indexes: `idx_routines_name` on `name`, `idx_routines_updated_at` on `updatedAt`

**`routine_blocks`**
- `id` — `text` primary key (UUID)
- `routineId` — `text` not null, FK → `routines.id` ON DELETE CASCADE
- `order` — `integer` not null (0-based, dense within `routineId`)
- `type` — `text` not null; one of `'single' | 'superset'`
- `roundCount` — `integer` nullable; required when `type='superset'`, must be null when `type='single'`
- `restSec` — `integer` nullable (block-level rest; for `superset` it is per-round, applied at end of round; for `single` it is per-item, applied between sets)
- `tempo` — `text` nullable (free-form, e.g. `3-1-1-0`)
- `notes` — `text` nullable
- Indexes: `idx_routine_blocks_routine_order` on `(routineId, order)`

**`routine_items`**
- `id` — `text` primary key (UUID)
- `blockId` — `text` not null, FK → `routine_blocks.id` ON DELETE CASCADE
- `routineId` — `text` not null, FK → `routines.id` ON DELETE CASCADE (denormalized for cheap whole-document loads)
- `order` — `integer` not null (0-based, dense within `blockId`)
- `exerciseId` — `text` not null (FK → `exercises.id`; soft reference — no DB-level cascade so a deleted exercise does not corrupt routines, mirroring Exercise Library's tolerant cross-table convention)
- `setCount` — `integer` not null (used for `single` blocks; ignored when the parent block is a `superset` — the block's `roundCount` governs)
- `repMode` — `text` not null; one of `'uniform' | 'per_set'`
- `rpeMode` — `text` not null; one of `'uniform' | 'per_set'`
- `setTypeMode` — `text` not null; one of `'uniform' | 'per_set'`
- `uniformReps` — `integer` nullable (used when `repMode='uniform'` and a single rep target is chosen)
- `uniformRepsMin` — `integer` nullable (used when `repMode='uniform'` and a range is chosen)
- `uniformRepsMax` — `integer` nullable
- `uniformRpe` — `real` nullable (used when `rpeMode='uniform'`; 1–10, half-step allowed)
- `uniformSetType` — `text` nullable; one of `'normal' | 'amrap' | 'to_failure' | 'drop_set' | 'rest_pause'` (used when `setTypeMode='uniform'`)
- `durationSec` — `integer` nullable (single duration target for cardio/mixed)
- `durationMinSec` — `integer` nullable (range — min)
- `durationMaxSec` — `integer` nullable (range — max)
- `notes` — `text` nullable (item-level free-form; absorbs distance/pace text in v1)
- Indexes: `idx_routine_items_block_order` on `(blockId, order)`, `idx_routine_items_routine` on `routineId`, `idx_routine_items_exercise` on `exerciseId`

**`routine_set_targets`**
- `id` — `text` primary key (UUID)
- `itemId` — `text` not null, FK → `routine_items.id` ON DELETE CASCADE
- `routineId` — `text` not null, FK → `routines.id` ON DELETE CASCADE (denormalized)
- `order` — `integer` not null (0-based, dense within `itemId`; corresponds to set index)
- `reps` — `integer` nullable (used when this set has a single rep target; may be null for AMRAP / to-failure)
- `repsMin` — `integer` nullable (used when this set has a rep range; may be null for AMRAP / to-failure)
- `repsMax` — `integer` nullable
- `rpe` — `real` nullable (1–10, half-step allowed)
- `setType` — `text` not null; one of `'normal' | 'amrap' | 'to_failure' | 'drop_set' | 'rest_pause'`
- `techniqueNotes` — `text` nullable (free-form; v1 home for drop-weight detail, pause durations, etc., until structured fields are added later)
- Indexes: `idx_routine_set_targets_item_order` on `(itemId, order)`

A row exists in `routine_set_targets` for a given item only when **at least one** of `repMode`, `rpeMode`, or `setTypeMode` is `per_set`. When all three modes are `uniform`, no set-target rows are stored — the item's uniform fields plus its `setCount` describe the entire prescription. Mixed-mode items (e.g., uniform reps but per-set RPE) carry a full `setTargets[]` array of length `setCount`, with each row populating only the per-set fields and leaving uniform-driven fields null.

**`pending_writes`** — reused from Exercise Library unchanged. Routine writes use `entity='routine'` with `op` ∈ `'create' | 'update' | 'delete'`. Payloads carry the **full nested routine document** for create/update and `{ id }` for delete (matching the Exercise Library outbox convention).

### Dexie stores (`src/client`, IndexedDB)

Dexie mirrors the **API shape** (whole documents), not the normalized server tables — this matches the Exercise Library mirror convention and keeps reads cheap.

- `routines` — keyPath `id`; indexes on `name`, `updatedAt`. Each row stores the full nested routine document (see Zod `RoutineSchema` below): `{ id, name, notes, estimatedDurationMin, blocks: [{ ..., items: [{ ..., setTargets?: [...] }] }], createdAt, updatedAt }`.
- `pendingWrites` — reused from Exercise Library, no schema changes.
- `exercises` / `equipment` — read-only consumers from Exercise Library; the in-builder picker queries `exercises` directly.

### Set-type enum (fixed, shared)

`normal`, `amrap`, `to_failure`, `drop_set`, `rest_pause`. Mutually exclusive — exactly one value per set target. Used at the per-set level (`routine_set_targets.setType`) and at the uniform level (`routine_items.uniformSetType`).

## Zod schemas (`src/shared`)

All validation lives in Zod in the shared layer and is imported by client (forms, Dexie guards) and server (Hono route validation). Types are derived via `z.infer` and re-exported from `src/shared/index.ts`. New file: `src/shared/routine.ts`.

- `SetTypeEnum` — `z.enum(['normal', 'amrap', 'to_failure', 'drop_set', 'rest_pause'])`
- `BlockTypeEnum` — `z.enum(['single', 'superset'])`
- `ModeEnum` — `z.enum(['uniform', 'per_set'])`
- `RepTargetSchema` — discriminated by presence:
  - either `{ reps: z.number().int().min(1).max(999) }`
  - or `{ repsMin: z.number().int().min(1).max(999), repsMax: z.number().int().min(1).max(999) }` with `repsMin <= repsMax`
  - or **absent entirely** (allowed only when the set's `setType` is `amrap` or `to_failure`)
- `SetTargetSchema` — `{ id: uuid, reps?, repsMin?, repsMax?, rpe?: z.number().min(1).max(10), setType: SetTypeEnum, techniqueNotes?: z.string().max(500).nullable() }`
- `DurationTargetSchema` — discriminated:
  - either `{ durationSec: z.number().int().min(1).max(86_400) }`
  - or `{ durationMinSec, durationMaxSec }` with `durationMinSec <= durationMaxSec`
  - or absent for pure-strength items
- `PrescriptionSchema` — the full payload on a `RoutineItem`:
  - `setCount: z.number().int().min(1).max(20)`
  - `repMode: ModeEnum`, `rpeMode: ModeEnum`, `setTypeMode: ModeEnum`
  - Uniform fields (one block, all optional individually but gated by mode flags via `superRefine`):
    - `uniformReps?`, `uniformRepsMin?`, `uniformRepsMax?`, `uniformRpe?`, `uniformSetType?: SetTypeEnum`
  - `setTargets?: SetTargetSchema[]` — present iff any mode is `per_set`; length must equal `setCount`
  - Duration: `durationSec?`, `durationMinSec?`, `durationMaxSec?`
- `RoutineItemSchema` — `{ id: uuid, exerciseId: uuid, order: int, ...PrescriptionSchema, notes?: string().max(1000).nullable() }`
- `RoutineBlockSchema` — `{ id: uuid, type: BlockTypeEnum, order: int, roundCount?: z.number().int().min(1).max(20), restSec?: z.number().int().min(0).max(3600), tempo?: z.string().max(20).nullable(), notes?: z.string().max(1000).nullable(), items: RoutineItemSchema[] }`
- `RoutineSchema` — full record: `{ id: uuid, name: z.string().trim().min(1).max(100), notes?: z.string().max(2000).nullable(), estimatedDurationMin?: z.number().int().min(1).max(600).nullable(), blocks: RoutineBlockSchema[], createdAt: number, updatedAt: number }`
- `RoutineCreateInput` — full record minus timestamps (or with optional timestamps; client supplies `id`).
- `RoutineUpdateInput` — full record minus timestamps; updates carry the **full nested document** (no patch form), matching the Exercise Library convention.

Cross-field rules enforced via `.superRefine`:
- When `repMode='uniform'`: exactly one of `uniformReps` or (`uniformRepsMin`+`uniformRepsMax`) must be set, **unless** `uniformSetType` is `amrap` or `to_failure` and `setTypeMode='uniform'`, in which case all three may be omitted.
- When `repMode='per_set'`: `uniformReps`/`uniformRepsMin`/`uniformRepsMax` must be absent; each `setTargets[i]` must satisfy `RepTargetSchema` (or omit reps if its own `setType` is `amrap`/`to_failure`).
- When `rpeMode='uniform'`: `uniformRpe` may be set; per-set `rpe` must be absent.
- When `rpeMode='per_set'`: `uniformRpe` absent; per-set `rpe` may be set per entry.
- When `setTypeMode='uniform'`: `uniformSetType` must be set; each `setTargets[i].setType` must equal `uniformSetType` (defensively normalized client-side before persist).
- When `setTypeMode='per_set'`: `uniformSetType` must be absent; each set target carries its own `setType`.
- `setTargets` must be present iff any of the three modes is `per_set`. Its length must equal `setCount`. Its `order` values must be `0..setCount-1` dense.
- Block invariant: `type='single'` ⇒ `items.length === 1` and `roundCount` is null; `type='superset'` ⇒ `items.length` is 2–6 and `roundCount` is set in `[1, 20]`.
- Block `order` values within a routine must be dense `0..N-1`; item `order` values within a block must be dense `0..M-1`. Validated server-side; client normalizes before submit.
- For items inside a `superset` block, `setCount` is accepted in payloads but ignored at execution time (the block's `roundCount` governs). Builder UI hides per-item set-count input inside supersets.
- `exerciseId` must be a UUID. Reference existence is checked **client-side** (against Dexie `exercises`) at form submit; server-side the check is soft (logs warning, does not reject) to tolerate outbox reordering — same convention as Exercise Library `equipmentIds`.

## API contract

All endpoints under `/api/v1/routines`. JSON in/out. **No auth gate in v1.** This is an explicit divergence from PRD, documented as an assumption per user direction in requirements (Q-F16).

- `GET /api/v1/routines` → `200 { routines: Routine[] }`. Returns the full list with nested blocks/items/setTargets. Filtering and sort are client-side.
- `GET /api/v1/routines/:id` → `200 Routine` | `404 { error: 'not_found' }`
- `POST /api/v1/routines` — body: `RoutineCreateInput` (with client-supplied `id`, nested blocks/items/setTargets).
  - `201 Routine` on success.
  - `400 { error: 'validation', issues }` on Zod failure.
  - `409 { error: 'id_conflict', id }` if the top-level routine `id` already exists.
- `PATCH /api/v1/routines/:id` — body: `RoutineUpdateInput` (full nested document).
  - Server replaces the routine + all child rows transactionally: delete old `routine_blocks` / `routine_items` / `routine_set_targets` for the routine, then insert new ones from the payload. This mirrors the "full payload, no patch" convention of Exercise Library and avoids per-child diffing.
  - `200 Routine` on success.
  - `404` if `id` not found.
  - `400` on validation failure.
- `DELETE /api/v1/routines/:id` → `204` on success or if already gone (idempotent delete; cascades to blocks, items, set targets via FK ON DELETE CASCADE).

Error shape is consistent with Exercise Library: `{ error: string, issues?: ZodIssue[], id?: string }`.

### Example payload (abbreviated)

```jsonc
{
  "id": "8f2c…",
  "name": "Push Day A",
  "notes": null,
  "estimatedDurationMin": 52,
  "blocks": [
    {
      "id": "b1…", "type": "single", "order": 0, "restSec": 150, "tempo": null,
      "items": [{
        "id": "i1…", "exerciseId": "ex-bench…", "order": 0,
        "setCount": 4, "repMode": "uniform", "rpeMode": "uniform", "setTypeMode": "uniform",
        "uniformReps": 5, "uniformRpe": 8, "uniformSetType": "normal"
      }]
    },
    {
      "id": "b2…", "type": "superset", "order": 1, "roundCount": 3, "restSec": 90,
      "items": [
        { "id": "i2…", "exerciseId": "ex-incdb…", "order": 0,
          "setCount": 3, "repMode": "uniform", "rpeMode": "uniform", "setTypeMode": "uniform",
          "uniformReps": 10, "uniformSetType": "normal" },
        { "id": "i3…", "exerciseId": "ex-cablefly…", "order": 1,
          "setCount": 3, "repMode": "uniform", "rpeMode": "uniform", "setTypeMode": "uniform",
          "uniformReps": 12, "uniformSetType": "normal" }
      ]
    },
    {
      "id": "b3…", "type": "single", "order": 2, "restSec": 60,
      "items": [{
        "id": "i4…", "exerciseId": "ex-pushdown…", "order": 0,
        "setCount": 3, "repMode": "uniform", "rpeMode": "uniform", "setTypeMode": "per_set",
        "uniformReps": 12,
        "setTargets": [
          { "id": "st1…", "order": 0, "setType": "normal", "reps": 12 },
          { "id": "st2…", "order": 1, "setType": "normal", "reps": 12 },
          { "id": "st3…", "order": 2, "setType": "amrap" }
        ]
      }]
    },
    {
      "id": "b4…", "type": "single", "order": 3,
      "items": [{
        "id": "i5…", "exerciseId": "ex-treadmill…", "order": 0,
        "setCount": 1, "repMode": "uniform", "rpeMode": "uniform", "setTypeMode": "uniform",
        "uniformSetType": "normal",
        "durationSec": 600, "notes": "3.5 mph @ 8% incline"
      }]
    }
  ],
  "createdAt": 1714600000000, "updatedAt": 1714600000000
}
```

## UI pages and states

Routes (React Router under `src/client`):

- `/routines` — list
- `/routines/new` — create (builder, empty)
- `/routines/:id` — edit (builder, prefilled). No separate detail/view page in v1 — the builder is the detail page, matching the mockup.

### List page (`/routines`)

- Top bar: hamburger (drawer nav), "Routines" title, `+` action routing to `/routines/new`.
- Full-width search input, placeholder `Search routines`. Case-insensitive substring match over `name`. Trimmed.
- Sort: alphabetical (`name` ASC, case-insensitive, locale-aware). No sort controls. No filter chips in this slice.
- Row layout: routine `name` bold, secondary muted line `<N> blocks · ~<estimatedDurationMin> min` (gracefully omits the duration clause when null).
- Row overflow menu: **Edit** (routes to `/routines/:id`) and **Delete** (confirm modal → Dexie delete + outbox enqueue).
- Empty state: "No routines yet" with a create CTA.
- Loading state: skeleton rows matching density during the first Dexie read.
- No-match state: inline "No matches" with a "Clear search" button.

### Builder page (`/routines/new`, `/routines/:id`) — ref `design/routine-builder.png`

Single screen, mobile-first, dense. Authoritative for layout.

- **Top bar:** back arrow (confirm-discard prompt if dirty), "Edit routine" / "New routine" title, prominent **Save** action (amber). Save commits Dexie write + enqueues outbox entry, then navigates back to `/routines`. Discard returns to list without persisting.
- **Routine header card:**
  - Large bold `name` field with inline pencil; tap to edit in place. Required, 1–100 chars.
  - Meta row: `~<estimatedDurationMin> min` chip (tap to edit numeric input, integer minutes 1–600). The mockup's `Upper` chip is **dropped**.
  - `notes` line — tap-to-edit free-form, placeholder `Add notes about this session…`. Max 2000 chars.
- **Block list:**
  - Stacked dense rows. Each block has a left drag handle (six-dot grip).
  - **Single-exercise block:** one-line summary `<setCount> × <repsSummary> · RPE <rpeSummary> · <restMmSs> rest`, with edit pencil and overflow menu (Delete). Tap row body or chevron to expand into the prescription editor.
  - **Superset block:** colored left accent bar grouping the items, header label `SUPERSET <letter>` (A, B, C… auto-assigned by order), block-level `roundCount` and per-round `restSec` editable on the block header. Items inside list with their own drag handles for intra-superset reordering. Each item shows a compact one-line summary; chevron expands the item's prescription editor. No nested cards. Item count constraint: 2–6.
  - **Technique chip:** when an item's resolved prescription includes any `setType` other than `normal`, surface an inline chip on the row summary (e.g., `AMRAP LAST SET`, `DROP SET`, `REST-PAUSE`) per the mockup.
  - **Cardio/Mixed item:** summary renders as `<duration> · Mixed` (e.g., `10 min · Mixed`); a small runner glyph indicates non-strength type. Distance/pace surfaces from `notes` when present.
- **Add affordances:**
  - Inline `+ ADD BLOCK` button between blocks and at the end of the list.
  - Sticky bottom action bar with two equal buttons: **+ Add exercise** (creates a `single` block, opens picker) and **Add superset** (chain icon — creates an empty `superset` block, opens picker for the first item, then prompts for the second).
- **Drag-to-reorder:**
  - Blocks reorder within the routine (block-level drag handle).
  - Items reorder within their parent `superset` (item-level drag handle inside the superset). Items inside a `single` block cannot move (a single only ever holds one item).
  - Cross-block item dragging is **not supported** in v1 (out of scope to keep affordance simple).
  - Implementation must support pointer and touch input. Pick one library that handles both (e.g., `dnd-kit`, `pragmatic-drag-and-drop`); confirm whether Exercise Library introduced one before adding a new dep.
- **Prescription editor (expanded row):**
  - **Set count:** numeric stepper, 1–20. Hidden when the parent block is a superset (block-level `roundCount` governs).
  - **Rep mode toggle:** segmented control `Uniform` / `Per set`. Switching from `per_set → uniform` collapses per-set entries down to the first set's values (silent). Switching from `uniform → per_set` clones the uniform values across `setCount` entries.
  - **Uniform reps input:** single integer or range (toggle between `12` and `8–12`).
  - **RPE mode toggle:** segmented control. Uniform shows one numeric input; per-set shows one input per set.
  - **SetType mode toggle:** segmented control. Uniform shows one set-type selector applied to all sets; per-set shows one selector per set, mutually exclusive enum (`Normal`, `AMRAP`, `To failure`, `Drop set`, `Rest-pause`).
  - **Per-set table:** when any mode is `per_set`, render a compact table — one row per set, columns for whichever per-set fields are active (reps, RPE, setType), plus an optional `techniqueNotes` chevron-expand below each row.
  - **Set-count resize behavior (silent):** when `setCount` grows in any per-set mode, append new entries by **cloning the last existing entry's values**; when it shrinks, **truncate trailing entries**. No prompt, no toast. Implemented as a deterministic client-side helper applied before persist so the payload always matches `setCount`.
  - **Rest input:** mm:ss-formatted text input that parses to `restSec`. Block-level for `single` (between sets); per-round for `superset`.
  - **Tempo input:** free-form text, optional, block-level. Hint: `eccentric-bottom-concentric-top`.
  - **Duration inputs:** mm:ss text inputs for `durationSec` or `durationMinSec`/`durationMaxSec` (toggle to range). Always shown for items whose linked exercise is `cardio` or `mixed`; hidden for pure `strength`. Mixed exercises render both rep and duration sections; the user fills what applies.
  - **Notes:** free-form multiline at item level; absorbs distance/pace text in v1.
- **Exercise picker (modal/sheet):**
  - Opens from `+ Add exercise`, `Add superset` (twice — once per initial item), and a "Replace exercise" affordance inside an item's expanded editor.
  - Reads from Dexie `exercises` directly; does not block on network.
  - Reuses the Exercise Library `/exercises` search + filter UI semantics: name/aliases substring search, type chips (Strength/Cardio/Mixed), muscle shortcut chips, equipment multi-select. No "Add to routine" round-trip — selecting an exercise inserts it into the current block and closes the sheet.
  - Inline "Create new exercise" affordance is **not** included in v1 — users navigate to `/exercises/new` separately. (Cheap to add later.)
- **Dirty-state guard:** if the user attempts to leave the builder with unsaved changes (back arrow, browser back, drawer nav), show a confirm-discard dialog.
- **404 state:** if `/routines/:id` is requested for an id not in Dexie, show "Routine not found" with a link back to the list.

## Validation rules

Driven by Zod in `src/shared/routine.ts`; reused on client (forms, Dexie guards) and server (Hono route validation).

- `name`: required, trimmed, 1–100 chars.
- `notes` (routine-level): optional, max 2000 chars.
- `estimatedDurationMin`: optional integer, 1–600. Always user-set (not derived from blocks in v1).
- `blocks[]`: 0 or more; `order` dense `0..N-1`. A routine with zero blocks is allowed (empty draft) but the Save button may be disabled until at least one block exists (UI affordance, not a schema rule).
- Block `type='single'`: `items.length === 1`, `roundCount` is null.
- Block `type='superset'`: `items.length` ∈ [2, 6], `roundCount` ∈ [1, 20].
- Items per superset: minimum 2 (otherwise it isn't a superset; auto-collapse to single is **not** done — UI prevents reaching <2 by disabling the item-delete control).
- `restSec`: 0–3600 inclusive, integer.
- `tempo`: max 20 chars, free-form.
- `setCount`: 1–20.
- `repMode` / `rpeMode` / `setTypeMode`: each independently `'uniform' | 'per_set'`.
- Uniform/per-set field gating per `superRefine` rules in [Zod schemas](#zod-schemas-srcshared).
- `reps` / `repsMin` / `repsMax`: integers 1–999. `repsMin <= repsMax`. Reps may be absent only when the controlling `setType` is `amrap` or `to_failure`.
- `rpe`: 1.0–10.0, half-step (`x.0` or `x.5`) — enforced via `.refine((n) => n * 2 === Math.round(n * 2))`.
- `setType`: enum, mutually exclusive (single value).
- `techniqueNotes`: optional, max 500 chars per set.
- `durationSec`: 1–86_400 (24h cap). `durationMinSec <= durationMaxSec`.
- `setTargets[]` length must equal `setCount` whenever it is present; `order` values dense `0..setCount-1`.
- `exerciseId` must be UUID; existence checked client-side, soft on server.

## Lifecycle

- **Mutability:** routines are mutable in place. No version history table. Future workout sessions (separate spec) snapshot the routine at log time so historical sessions are immutable independent of subsequent edits.
- **Hard delete:** `DELETE /api/v1/routines/:id` and Dexie delete remove the routine and cascade (FKs ON DELETE CASCADE) to `routine_blocks`, `routine_items`, `routine_set_targets`. No archive flag, no soft delete.
- **PATCH semantics:** full-document replace. Server transactionally deletes all child rows for the routine and re-inserts from the payload. Client sends the same shape it stores.
- **Cross-spec exercise deletion:** the `exerciseId` reference is soft (no FK cascade). If an exercise is deleted from the library while still referenced by a routine, the routine row is preserved; the builder renders the missing item with a "Missing exercise" placeholder and a "Replace" action. (This is consistent with the snapshot-at-log-time direction in Exercise Library's "Future work" section.)

## Offline and sync flow

Reuses Exercise Library's outbox pattern unchanged. No new flusher logic.

- **Reads:** UI reads always go through Dexie, wrapped in Tanstack Query.
- **Writes:** every create/update/delete performs a single Dexie transaction that (a) writes the whole-document routine row and (b) appends a `pendingWrites` entry with `entity='routine'`, full-record payload for create/update, `{ id }` for delete.
- **Outbox entry lifecycle:** identical to exercises — `201` on create, `200` on update, `204` on delete; `409 id_conflict` on create logs and removes the entry; `404` on update or delete is treated as already-gone and removes the entry.
- **Reconciliation (pull):** on app load and periodically while online, the client pulls `GET /api/v1/routines` and merges using the same rule as Exercise Library — local wins for any id with a pending outbox entry; otherwise server replaces local. Last-write-wins by `updatedAt`.
- **IDs:** client-generated UUIDv4 at all four levels (routine, block, item, set target).

## Existing code to leverage

**`specs/exercise-library/` end-to-end pattern**
- Mirror the Drizzle table layout, Zod schema split, Hono router wiring, Dexie store shape, list/detail/create page split, and `pendingWrites` outbox usage exactly.
- Reuse the error shape `{ error, issues?, id? }` and the `409 id_conflict` convention on `POST`.

**`src/shared/pending-write.ts`**
- Already generic — extend the `entity` discriminator union to include `'routine'`. No structural change.

**`src/shared/exercise.ts` and `src/shared/equipment.ts`**
- Pattern templates for `RoutineSchema`, `RoutineCreateInput`, `RoutineUpdateInput`. Mirror the trim/lowercase/dedupe `.transform` style where applicable (e.g., `name.trim()`).

**`src/db/schema.ts` Drizzle conventions**
- Reuse `sqliteTable`, `text` PKs, `integer("...", { mode: "timestamp_ms" })`, JSON-encoded array columns where helpful, and the `idx_<table>_<col>` index naming convention.

**`src/client/db` Dexie store and `src/client/sync` outbox flusher**
- Add a `routines` Dexie store alongside the existing `exercises` / `equipment` / `pendingWrites` stores. Wire the flusher to handle `entity='routine'` against `/api/v1/routines` using the same FIFO + retry/backoff loop already in place.

**`src/client/pages` exercise picker UI**
- The exercise list page's search + chip + row primitives should be lifted into a reusable picker component (modal/sheet) used by both `/exercises` and the routine builder, rather than duplicated.

**`src/client/lib/theme.ts` + `src/client/styles.css` design tokens**
- Use existing CSS variables (`--bg`, `--surface`, `--border`, `--accent`, `--accent-fg`, `--text`, `--text-muted`, `--text-subtle`, `--radius-card`) for all builder surfaces. The amber accent on `SUPERSET A` and the `Save` button comes from `--accent`.

**`src/client/app.tsx` shell and router**
- Register `/routines`, `/routines/new`, `/routines/:id` alongside the existing exercise routes. Preserve the mobile-first max-width container.

## Future work

- **Bearer-token auth.** Reintroduce per the PRD when the multi-device or multi-user story lands. The route table is ready; only the middleware needs adding.
- **Structured technique payloads.** Drop-set weight arrays, rest-pause cluster definitions, pause durations — when the workout logger needs them.
- **Structured distance/pace targets.** Today free text in `notes`; promote to first-class fields when the cardio logger is designed.
- **Routine duplication / templating.** "Duplicate routine" action and program-level composition.
- **Cross-block item drag-and-drop.** Move an item from inside a superset to a single (and vice versa) without going through delete + re-add.
- **Stackable technique modifiers.** If real use needs e.g. "AMRAP drop set," replace `setType` with a tag set; for now the enum is sufficient.
- **List page filters.** Body-part / day-of-week / tag filters once routines accumulate.
- **Estimated duration auto-derivation.** Compute from set count, rest, and tempo when sessions provide enough data to calibrate.

## Out of scope (v1)

- Live workout sessions, the logger, mutable execution state, session hydration.
- Programs, workout history, goals, calendar/scheduling.
- Routine version history table — mutable in place; sessions snapshot intent at log time (separate spec).
- Bearer-token auth on `/api/v1/routines` (explicit divergence from PRD, deferred).
- Structured technique payloads beyond the `setType` enum + free-form `techniqueNotes` — no drop-weight arrays, no pause-duration fields.
- Structured distance/pace targets — free text in `notes` only.
- Stackable technique modifiers — exactly one `setType` per set.
- Nested supersets / circuits / rounds-of-rounds.
- Filter chips on the list page beyond name search and alphabetical sort.
- Routine category/tag chips ("Upper", "Push", etc.) — `Upper` chip in the mockup is dropped.
- Routine duplication / "save as new" / program composition.
- Cross-block item drag-and-drop in the builder.
- Inline "Create new exercise" affordance inside the picker — users go through `/exercises/new`.
- Bulk import/export and bulk API endpoints.
- Routine-level `lastUsedAt` and usage stats — derived from sessions later.
