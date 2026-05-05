# Spec Requirements: Routine Template Layer

## Initial Description

This spec covers the **routine template / planning layer only**. It does NOT cover live workout sessions, logging, or mutable execution state — those are a separate spec.

A routine is a reusable workout template: a named, ordered list of blocks (single-exercise or superset), where each block holds ordered items referencing an exercise plus structured prescription metadata (sets, rep mode, rep targets/ranges, rest, RPE, tempo, technique modifiers, duration targets, notes). Includes builder UX (mobile-friendly, dense, progressive disclosure), reordering of blocks and items within a superset, and CRUD via `/api/v1`. Template-side only — template intent is separated from session execution reality.

Source documents: `docs/PRD.md` (sections "Routine builder" and "2. Routine model"), `docs/PRODUCT-PLAN.md` (section "2) Routine builder direction" and "Phase 2 — Routine template redesign").

## Requirements Discussion

### First Round Questions

**Q-A1:** Greenfield, or extending an existing routines slice?
**Answer:** Greenfield, but build on existing spec patterns and decisions from `/home/mike/Development/Forge/specs/exercise-library/` (Drizzle + Zod + Hono + Dexie + `pending_writes` outbox, list/detail/create page split). Mirror that.

**Q-A2:** Route conventions?
**Answer:** Use the same convention as `exercise-library`. Spec-writer's call within that pattern.

**Q-B3:** When set count changes in custom-per-set mode, prompt or silently extend/truncate?
**Answer:** (User did not understand the question — decision delegated.) **Decision:** silently extend per-set entries by cloning the last set's values when set count grows; silently truncate trailing entries when it shrinks. No prompt. Documented as assumption.

**Q-B4:** Rep target shape — single number, range, or both?
**Answer:** Structured with min/max AND set types include AMRAP, to-failure, etc. Each set target carries: numeric `reps` OR `repsMin`/`repsMax`, plus a `setType` enum (`normal | amrap | to_failure | drop_set | rest_pause`). AMRAP / to-failure mean numeric reps may be absent.

**Q-B5:** Are technique modifiers stackable (e.g., AMRAP drop set)?
**Answer:** Single `setType` per set — mutually exclusive.

**Q-B6:** How much technique detail to capture (drop weights, pause durations, etc.)?
**Answer:** (User: spec-writer's call.) **Decision:** flag-only via the `setType` enum + an optional free-form `techniqueNotes` per set in v1. No structured drop-weight arrays or pause durations. Defer structured technique data to a later spec.

**Q-B7:** Per-set vs uniform — which fields support per-set in custom mode?
**Answer:** **CRITICAL CORRECTION: techniques (`setType`) can vary per set.** In custom-per-set mode, each set has its own `setType`. In uniform mode, all sets share one `setType`. `setType` lives on the set target, not the item.
- Reps: per-set or uniform.
- SetType: per-set or uniform (follows rep mode).
- RPE: per-set or uniform.
- Rest, tempo: stay block-level for v1 (assumption — see Assumptions).

**Q-C8:** Duration targets — integer seconds with optional range, mm:ss UI input?
**Answer:** Yes — integer seconds, optional range, mm:ss UI input. Distance/pace = free text in notes for v1.

**Q-C9:** Mixed exercises show both rep and duration fields?
**Answer:** Yes — both shown; user fills what applies.

**Q-D10:** Nested supersets allowed?
**Answer:** No. Single layer only.

**Q-D11:** Rest in supersets — between items in a round, or after a full round?
**Answer:** Per-superset-round (applied at end of round, not between items within a round).

**Q-D12:** Where does superset round count live?
**Answer:** Block level. Overrides item-level set count for items inside a superset.

**Q-E13:** Routine-level metadata fields?
**Answer:** `name`, `notes`, `estimatedDurationMin` (user-set). Drop the "Upper" tag chip from v1.

**Q-E14:** Mutability of routines and version history?
**Answer:** Mutable in place, no version history table. Session snapshot (handled by session spec) preserves history.

**Q-E15:** Delete behavior?
**Answer:** Hard delete.

**Q-F16:** Auth on `/api/v1/routines`?
**Answer:** No auth in v1 — single user, local. Bearer-token treated as future work. Diverges from PRD's "bearer token in v1" — explicit assumption per user direction.

**Q-F17:** API shape (full-document vs granular endpoints)?
**Answer:** Spec-writer's call. **Decision:** full-document GET/POST/PATCH/DELETE under `/api/v1/routines` with client-supplied UUIDs and nested blocks/items in the payload, matching exercise-library's pattern.

**Q-F18:** List page filtering/sorting?
**Answer:** Name search + alphabetical sort. No new filter chips in this slice.

**Q-G19:** Drag-to-reorder in v1?
**Answer:** Yes — drag to reorder blocks AND items-within-superset, on desktop + touch. v1 requirement.

**Q-G20:** Exercise picker UX?
**Answer:** Spec-writer's call. **Decision:** modal/sheet exercise picker reading from local Dexie exercise cache, reusing `/exercises` search/filter semantics.

### Existing Code to Reference

**Similar Features Identified:**
- Feature: Exercise Library — Path: `/home/mike/Development/Forge/specs/exercise-library/`
  - Mirror its: Drizzle schema patterns, Zod validation, Hono route structure, Dexie cache shape, `pending_writes` outbox sync pattern, list/detail/create page split.
  - Reuse `/exercises` search/filter semantics inside the routine builder's exercise picker (modal/sheet against the local Dexie exercise cache).
- No other similar features identified for reference.

### Follow-up Questions

None asked — decisions delegated where the user said "your call" are documented as Assumptions.

## Visual Assets

### Files Provided:

- `/home/mike/Development/Forge/design/routine-builder.png` — authoritative mockup for the routine **edit/builder** screen. Mobile, light theme. Shows:
  - Top bar: back arrow, "Edit routine" title, prominent "Save" action (orange).
  - Routine header card: large routine name ("Push Day A") with inline edit pencil; meta chips (`~52 min`, `Upper`); placeholder notes line ("Add notes about this session…").
  - Stacked blocks, each draggable (drag-handle dots on left edge):
    - Single-exercise block ("Barbell Bench Press"): dense one-line summary `4 × 5 · RPE 8 · 2:30 rest`, edit pencil, overflow menu.
    - Superset block ("SUPERSET A") with left orange accent bar grouping two items ("Incline DB Press" `3 × 10 · 90s`, "Cable Fly" `3 × 12 · 60s`); chevrons indicate expand-to-detail.
    - Single-exercise block ("Tricep Pushdown") with an `AMRAP LAST SET` orange tag chip beside the prescription summary, demonstrating per-set technique surfaced inline.
    - Cardio/Mixed block ("Treadmill Incline Walk") summary `10 min @ 3.5 mph · Mixed` with a runner glyph.
  - "+ ADD BLOCK" affordance between blocks and at the end.
  - Bottom action bar: two equal buttons — "+ Add exercise" and "Add superset" (chain icon).

### Visual Insights:

- Fidelity: high-fidelity mockup (authoritative for builder layout, hierarchy, and density).
- Progressive disclosure: rows show a compact prescription summary by default; deeper editing is a secondary affordance (chevron/tap-to-expand or pencil) — exact expanded-row UI is implementation choice.
- Supersets: visually grouped via colored left accent + "SUPERSET A" header, kept compact (no nested cards).
- Technique modifiers surface as inline chips on the row summary (e.g., `AMRAP LAST SET`) — confirms `setType` should be visible at row-summary level when present.
- Drag-handle dots on every block confirm Q-G19 drag-to-reorder requirement.
- Routine name and estimated duration are immediately visible at the top; notes are inline but optional. Confirms locked UX direction from PRODUCT-PLAN.
- The `Upper` tag chip in the mockup is explicitly dropped from v1 per Q-E13.
- Other states (list page, detail view, exercise picker, expanded prescription editor for uniform-vs-per-set, setType selector UI) are **not** covered by the mockup and are implementation-choice — describe expected behavior in prose; do not block on visuals.

## Requirements Summary

### Functional Requirements

**Routine entity:**
- Fields: `id` (UUID, client-supplied), `name` (string, required), `notes` (string, optional), `estimatedDurationMin` (integer, user-set, optional), `blocks` (ordered array), timestamps.
- Mutable in place. No version history table. Hard delete.

**Block entity (ordered within a routine):**
- Fields: `id` (UUID), `type` (`single | superset`), `order` (integer), `restSec` (block-level rest, optional), `tempo` (block-level, optional, free-form), `notes` (optional), `items` (ordered array).
- Superset-only: `roundCount` (integer) — overrides item-level set count for items inside; `restSec` on a superset is per-round (applied at end of each round, not between items within a round).
- Single-only: holds exactly one item.
- No nested supersets (single layer only).

**Item entity (ordered within a block):**
- Fields: `id` (UUID), `exerciseId` (FK to exercise library), `order` (integer), `prescription` payload, `notes` (optional).
- Inside a superset, item-level set count is ignored in favor of the block's `roundCount`.

**Prescription payload (structured):**
- `setCount` (integer) — used for `single` blocks; ignored inside supersets.
- `repMode`: `uniform | per_set`.
- `rpeMode`: `uniform | per_set`.
- `setTypeMode`: `uniform | per_set` (follows the per-set principle from Q-B7).
- Uniform fields (when corresponding mode is `uniform`):
  - `reps` (integer) OR `repsMin`/`repsMax` (integer range).
  - `rpe` (numeric, optional).
  - `setType` (`normal | amrap | to_failure | drop_set | rest_pause`).
- Per-set targets (`setTargets[]`, used when any mode is `per_set`):
  - Each entry: `reps` OR `repsMin`/`repsMax` (may be absent for AMRAP / to-failure), `rpe` (optional), `setType` (enum), `techniqueNotes` (free-form string, optional).
  - When set count changes in per-set mode: silently extend by cloning the last entry's values when growing; silently truncate trailing entries when shrinking. No prompt.
- Duration targets (for cardio/mixed exercises):
  - `durationSec` (integer) OR `durationMinSec`/`durationMaxSec` (range).
  - mm:ss input in UI.
  - Distance/pace captured as free text in `notes` in v1.
- Mixed exercises render both rep and duration fields; user fills what applies.
- `setType` values are mutually exclusive per set (single setType per set, not stackable).
- `techniqueNotes` is the only structured technique payload in v1; no drop-weight arrays or pause-duration fields.

**Builder UX:**
- Routine name and estimated duration immediately visible at top.
- Optional details/settings behind a secondary affordance.
- Dense, scan-friendly exercise rows showing a compact prescription summary.
- Rows expand/collapse for editing rather than always showing inline forms.
- Supersets clearly grouped (visual accent / header) but compact; no nested cards.
- Technique modifiers surface as inline chips on the row summary when present (e.g., `AMRAP LAST SET`).
- Drag-to-reorder: blocks within a routine, AND items within a superset. Required on desktop AND touch in v1.
- Add-block affordances inline between blocks and at the end; bottom bar with "Add exercise" and "Add superset".
- Exercise picker: modal/sheet that reads from local Dexie exercise cache and reuses `/exercises` search/filter semantics.
- Mobile-first dense layout aligned with `design/routine-builder.png`.

**List page:**
- Name search + alphabetical sort.
- No filter chips in this slice.

**API (`/api/v1/routines`):**
- Full-document endpoints: `GET /` (list), `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`.
- Client-supplied UUIDs for routines, blocks, items.
- Nested blocks/items in request/response payloads.
- Mirrors exercise-library's Drizzle + Zod + Hono pattern.
- No auth in v1 (single-user local). Bearer-token deferred.

**Local-first / sync:**
- Dexie cache for routines (mirrors exercise-library cache pattern).
- `pending_writes` outbox for mutations.

### Reusability Opportunities

- **Exercise Library spec patterns** (`specs/exercise-library/`): replicate Drizzle table + Zod schema + Hono router layout, list/detail/create page split, Dexie store + `pending_writes` outbox sync.
- **Exercise picker**: reuse the existing `/exercises` search/filter semantics and Dexie exercise cache rather than building a parallel search.
- **Form/row patterns**: any expand/collapse row primitive used in exercise-library (if present) should be reused for prescription rows.
- **Drag-and-drop**: pick a single d&d primitive that works across desktop pointer + touch; verify whether exercise-library already introduces one before adding a new dep.

### Scope Boundaries

**In Scope:**
- Routine entity with name, notes, user-set estimated duration.
- Ordered blocks (`single`, `superset`); single layer only.
- Ordered items inside blocks referencing exercises from the library.
- Structured prescription model: set count, rep mode (uniform vs per-set), rep targets/ranges, RPE (uniform vs per-set), `setType` (uniform vs per-set, mutually exclusive enum), block-level rest and tempo, duration targets for cardio/mixed, free-form `techniqueNotes` per set, free-form `notes`.
- Superset semantics: block-level `roundCount` overrides item set count; rest is per-round at end of round.
- Drag-to-reorder blocks and items-within-superset on desktop + touch.
- Modal/sheet exercise picker over the Dexie exercise cache.
- List page with name search and alphabetical sort.
- Full-document CRUD API at `/api/v1/routines` with client-supplied UUIDs.
- Dexie cache and `pending_writes` outbox integration.
- Mobile-friendly dense builder UX with progressive disclosure.

**Out of Scope:**
- Live workout sessions, logging, mutable execution state, session hydration.
- Programs, workout history, goals.
- Routine version history table (sessions snapshot history in their own spec).
- Bearer-token auth (deferred — diverges from PRD; documented assumption).
- Structured technique payloads beyond enum + free-form notes (drop-weight arrays, pause durations, etc.).
- Structured distance/pace targets (free text in notes for v1).
- Stackable technique modifiers (single `setType` per set in v1).
- Nested supersets.
- Filter chips on list page beyond name search.
- "Upper"/category tag chips on routines.

### Technical Considerations

- **Architecture mirror:** Drizzle schema, Zod validation, Hono routes, Dexie offline cache, `pending_writes` outbox — match exercise-library exactly.
- **IDs:** client-supplied UUIDs at all three levels (routine, block, item) to support local-first creation and idempotent sync.
- **Schema shape:** prefer normalized server schema (routines / blocks / items / set_targets) but expose nested payloads at the API boundary to keep the client model whole-document.
- **Per-set storage:** `setTargets[]` stored as a JSON column or as rows in a `set_targets` table — implementation decision deferred to spec-writer; must round-trip cleanly with mode flags.
- **Mode flags drive validation:** Zod schema must enforce the right shape based on `repMode` / `rpeMode` / `setTypeMode` (uniform vs per-set fields populated, the other absent/ignored).
- **Mutually exclusive `setType`:** enforce in Zod (single enum field).
- **Silent set-count resize** must be a deterministic client-side helper applied before persisting, so server payloads always match `setCount`.
- **Drag-and-drop** must work on touch and pointer; choose a library compatible with both.
- **Exercise picker** reads Dexie directly to stay offline-capable; must not block on network.
- **No auth middleware** on `/api/v1/routines` in v1 (explicit divergence from PRD).
- **Hard delete** cascades to blocks, items, and per-set targets.

### Assumptions (Documented Decisions)

1. **Set-count resize in per-set mode** is silent: extend by cloning last entry's values; truncate trailing entries. (Q-B3 delegated.)
2. **Technique detail in v1** is enum + optional `techniqueNotes` per set; no structured drop weights or pause durations. (Q-B6 delegated.)
3. **Rest and tempo stay block-level** in v1; not per-set. (Q-B7 — explicitly flagged for confirmation but treated as the working assumption.)
4. **Routes follow exercise-library convention.** (Q-A2 delegated.)
5. **API shape is full-document** GET/POST/PATCH/DELETE under `/api/v1/routines` with nested blocks/items and client-supplied UUIDs. (Q-F17 delegated.)
6. **Exercise picker** is a modal/sheet over the local Dexie exercise cache reusing `/exercises` search/filter semantics. (Q-G20 delegated.)
7. **No auth in v1** — single-user local. Diverges from PRD's "bearer token in v1" per explicit user direction. (Q-F16.)
8. **Visuals beyond `design/routine-builder.png`** (list page, detail view, expanded-row prescription editor for uniform-vs-per-set, setType selector UI, picker) are implementation-choice; behavior described in prose, no visuals required to proceed.
