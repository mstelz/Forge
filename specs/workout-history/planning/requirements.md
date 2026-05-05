# Spec Requirements: Workout History

## Initial Description

A dedicated history surface that lists every logged session (both routine-driven and freeform) in a dense, scannable layout, plus cross-cutting aggregation tiles summarizing lifetime training output. Authoritative visual reference: `design/history-list.png`. Per-session detail (`design/history-detail.png`) is already specced in workout-sessions and is referenced — not redefined — here.

This slice is a **read-only view** over `sessions` + `session_set_logs` already defined in `specs/workout-sessions/planning/spec.md`. **No new tables. No new mutations.** It also closes the gap left in workout-sessions, which explicitly deferred history-list aggregations and date-range filtering.

## Requirements Discussion

No second-round questions were asked. Defensible defaults were chosen and documented as assumptions below; the orchestrator instructed direct authorship.

### First Round Questions

**Q1: Where do the data come from — new tables, or pure reads over existing sessions/logs?**
**Answer (assumed):** Pure reads. Reuse `sessions` and `session_set_logs` from workout-sessions verbatim. No aggregation tables. No caching layer in v1. Computed-on-read on both client (Dexie) and server (Drizzle/SQLite).

**Q2: What aggregations populate the top tiles, and over what scope?**
**Answer (assumed):** Five tiles (mockup shows three; PRD calls for five — we ship five and let the layout truncate/wrap on narrow widths):
- **TOTAL SESSIONS** — count of `sessions` with `status='finished'` matching active filters.
- **TOTAL VOLUME** — sum of `weightKg * reps` across `session_set_logs` where `status='logged'`, `setType IN ('normal','drop','amrap','failure')`, `reps > 0`, `weightKg > 0`, parent session matches filters.
- **TOTAL SETS** — count of `session_set_logs` with `status='logged'` (excludes `'skipped'` and `'extra'` per question wording — see Assumption A1).
- **TOTAL EXERCISES COMPLETED** — sum across matching sessions of distinct `exerciseId` values having ≥1 `status='logged'` log in that session.
- **TOTAL TIME** — sum of `endedAt - startedAt` (ms) across matching `status='finished'` sessions; rendered `Hh Mm`.

Default scope: **lifetime** (no filter). All tiles re-compute when any filter changes.

**Q3: What filters apply to the list and tiles?**
**Answer (assumed):**
- **Date range** chips: `ALL` (default), `THIS WEEK`, `THIS MONTH`, `THIS YEAR`, plus `CUSTOM` opening a date-range picker (`from`/`to`, inclusive, by `endedAt`).
- **Source routine** — single-select from a Dexie-derived list of routines that have at least one finished session.
- **Source program** — single-select; matches sessions where `sourceProgramId` equals the chosen id.
- **Contains exercise** — single-select; matches sessions with ≥1 log for that `exerciseId`.
- **Search** — substring (case-insensitive, trimmed) over routine `title` and session `notes` (basic LIKE on server, identical Dexie scan client-side).

All filters AND together. Filters apply to **both** the list and the aggregation tiles.

**Q4: How is filter state preserved?**
**Answer (assumed):** URL query string. Shareable / back-button-friendly. Encoded keys: `range`, `from`, `to`, `routine`, `program`, `exercise`, `q`, `cursor`. Defaults are omitted from the URL.

**Q5: How are units displayed?**
**Answer (assumed):** Storage is canonical (kg, m, sec) per workout-sessions. Display follows the future Settings unit-preference. **In v1 hardcode `kg`** (workout-sessions notes Settings is out of scope; matching that deferral here). Volume tile renders `<n> kg`. Future Settings slice flips this without schema change.

**Q6: How is the list paginated/scrolled, and how is it sorted?**
**Answer (assumed):** Sorted by `endedAt DESC` (with `startedAt DESC` as tiebreaker for same-day finishes). List is virtualized client-side over the Dexie cache. Server endpoint paginates via cursor (`endedAt + id`), `limit=50` default, `limit<=200` max — used by the API for parity with the Dexie path; the client typically reads everything from Dexie.

**Q7: Per-session detail surface — owned here or in workout-sessions?**
**Answer:** Owned by workout-sessions at `/sessions/:id` (post-finish summary view, mockup `design/history-detail.png`). This slice links into it from each row; we do not redefine it.

**Q8: What's explicitly out of scope?**
**Answer (assumed):**
- Per-exercise history page (lives in workout-sessions, on `/exercises/:id`).
- Goals progress.
- Charts / trend lines beyond the basic 1RM trend already in workout-sessions.
- Exporting from history (export is its own slice).
- Editing history (it's immutable per workout-sessions).
- Aggregation tables, server-side caching of aggregates, materialized views.
- Multi-select chips (single-select in v1 for routine/program/exercise filters).
- Dashboard charts, weekly volume bars, streak counters.

### Existing Code to Reference

**Similar Features Identified:**
- `specs/exercise-library/planning/spec.md` — pattern for split list pages, Tanstack Query + Dexie reads, URL-state-driven filters, dense list rows, top-bar with search icon.
- `specs/workout-sessions/planning/spec.md` — owns `sessions` + `session_set_logs` Drizzle tables, Zod schemas (`SessionSchema`, `SessionSetLogSchema`), Dexie stores (`sessions`, `sessionSetLogs`), and the post-finish detail view at `/sessions/:id`. **CRITICAL: do not redefine these tables.** History reuses them as-is.
- `specs/routines/planning/spec.md` — referenced for routine-name lookup in the source-routine filter and list-row subtitle.
- `specs/programs/planning/spec.md` — referenced for program metadata (program name, week/day labels) used in the list-row "Hypertrophy Block · Week 3" subtitle and the source-program filter.

**Components/patterns to potentially reuse:**
- Top-bar layout (hamburger / title / right-side icon) from `/exercises`.
- Filter chip row component pattern (single horizontal-scrolling row) from `/exercises`.
- Dexie + Tanstack Query reads (`useLiveQuery`-style) from `src/client/db/queries.ts`.
- Empty / loading / "No matches" states from `/exercises` list.
- Day-rail / amber day-number tile from `design/history-list.png` mockup (new component for this slice).

**Backend logic to reference:**
- Hono router scaffold in `src/server/routes/api.ts`; add a sibling `history.ts` router under `/api/v1/history`.
- Drizzle query patterns from existing `sessions.ts` / `exercises.ts` routes. **No schema changes.**

## Visual Assets

### Files Provided

The visuals folder for this spec (`specs/workout-history/planning/visuals/`) is empty. The authoritative mockups live in the project-wide `design/` folder:

- `/home/mike/Development/Forge/design/history-list.png` — high-fidelity mockup for the history list surface this slice owns.
- `/home/mike/Development/Forge/design/history-detail.png` — high-fidelity mockup for the per-session detail. Owned by workout-sessions; referenced here only as the link target from history rows.
- `/home/mike/Development/Forge/design/history-list.json` — Stitch metadata describing the mockup (top-bar copy, tile labels, chip set, row composition, sample data).

### Visual Insights

**`design/history-list.png` (high-fidelity, dark mode):**
- Top bar: hamburger left, amber **HISTORY** title, search icon right.
- Stats strip: three tiles in a row — `THIS MONTH 12 BOOKINGS`, `VOLUME 248.4 K LBS`, `AVG DURATION 52 MINUTES`. Oversized tabular numerics. (PRD calls for five tiles total — we ship five; layout wraps to 2 rows on narrow widths.)
- Filter chip row: `ALL` (active amber fill), `THIS WEEK`, `THIS MONTH`, …  (more chips off-screen right; horizontally scrollable).
- Grouped by date with sticky muted headers (`APR 23 · WEDNESDAY`).
- Each row:
  - Left: amber-bordered day-number tile (e.g., `23`); the latest/PR session gets a filled amber tile.
  - Center top: bold routine name (`Push Day A`).
  - Center bottom: muted line (`Hypertrophy Block · Week 3`) — program/block subtitle, omitted for freeform sessions.
  - Right: `PR` amber pill when applicable; chevron.
  - The exercise/sets/duration micro-line (`5 EXERCISES · 18 SETS · 52 MIN`) is part of the dense composition — replaces the pill-heavy format called out in PRODUCT-PLAN.
- Freeform sessions (`Apr 15 · FREEFORM · Recovery Focus`) render with the same row shape; routine/block subtitle replaced with the freeform notes/title.
- Bottom of viewport: no tab bar.
- **Fidelity:** high-fidelity — treat layout, chip set, and tile composition as authoritative.

**`design/history-detail.png` (high-fidelity):**
- Owned by workout-sessions; not implemented here. Used only as the navigation target for row taps.

## Requirements Summary

### Functional Requirements

**Surfaces**
- New page: `/history`. Top bar matches `/exercises`: hamburger, amber **HISTORY** title, search icon (toggles an inline search input).
- Aggregation tiles strip at top of page (always visible, recomputes on filter change).
- Filter chip row immediately under the tiles.
- Date-grouped, virtualized session list under the chips.
- Each row links to `/sessions/:id` (workout-sessions' post-finish detail).

**Aggregation tiles (5)**
- TOTAL SESSIONS, TOTAL VOLUME (kg), TOTAL SETS, TOTAL EXERCISES COMPLETED, TOTAL TIME (`Hh Mm`).
- Computed on read over the active filter set. Default filter: lifetime, no other constraints.
- See Q2 above for exact formulas.

**Session list**
- Sort: `endedAt DESC`, tiebreak `startedAt DESC`.
- Group: by calendar day of `endedAt` (using local time zone, derived per render — NOT stored).
- Row composition (dense, mockup-faithful):
  - Day-number tile (amber border default; amber fill on the most recent session and on PR sessions).
  - Routine name (bold) — falls back to `"Freeform"` for `sourceType='freeform'`.
  - Program/block subtitle (muted) — `<programName> · Week <n>` when `sourceType='program_day'` and program data is resolvable; hidden otherwise.
  - Micro-line (muted, small caps): `<exCount> EXERCISES · <setCount> SETS · <durationMin> MIN`.
  - PR pill (amber) when this session set ≥1 EST 1RM peak vs. prior history (reuse the same Epley computation defined in workout-sessions).
  - Trailing chevron.
- Pagination: virtualized client-side over Dexie cache; server endpoint cursor-paginates for parity.
- Empty state: "No sessions yet — finish a workout to see history here."
- Filtered-zero state: inline "No matches" row with "Clear filters" button.
- Loading state: skeleton rows.

**Filters (URL-encoded; AND together)**
- `range`: `all` | `week` | `month` | `year` | `custom` (with `from`/`to` ms timestamps, inclusive on `endedAt`).
- `routine`: routine UUID.
- `program`: program UUID.
- `exercise`: exercise UUID.
- `q`: search string (over `sessions.title` + `sessions.notes`, case-insensitive substring; LIKE on server).
- All filter chips show a count badge of remaining sessions when active.

**Read-only**
- No mutations. No edit affordances. No delete. (Discard/finish/edit live in workout-sessions during a session's `in_progress` phase only.)

### API

All endpoints under `/api/v1/history`. JSON. No auth gate (consistent with sibling slices).

- `GET /api/v1/history/sessions` — paginated session list with filters.
  - Query params: `range`, `from`, `to`, `routine`, `program`, `exercise`, `q`, `cursor`, `limit` (default 50, max 200).
  - Response: `200 { sessions: SessionSummary[], nextCursor: string | null }` where `SessionSummary` is `{ id, title, sourceType, sourceRoutineId, sourceRoutineName, sourceProgramId, sourceProgramName, sourceProgramWeekIndex, sourceProgramDayIndex, startedAt, endedAt, exerciseCount, setCount, volumeKg, durationMs, hasPr }`.
  - Server computes per-row counters via SQL aggregates over `session_set_logs` joined to `sessions`; only `status='finished'` sessions returned.
- `GET /api/v1/history/summary` — aggregations.
  - Same filter params. Response: `200 { totalSessions, totalVolumeKg, totalSets, totalExercises, totalDurationMs }`.
- Reuses existing `GET /api/v1/sessions/:id` (workout-sessions) for the per-session detail surface.
- Reuses existing `GET /api/v1/sessions/:id/logs` (workout-sessions) for per-exercise history reads.
- **Discarded sessions** (`status='discarded'`) are hard-deleted in workout-sessions; they cannot appear in history. **In-progress** sessions are excluded server- and client-side.

### Dexie / Client

- **Read-only queries** over the existing `sessions` and `sessionSetLogs` Dexie stores. No new stores. No new outbox entity.
- New hooks (in `src/client`):
  - `useHistorySummary(filters)` — derives the 5 aggregates from Dexie. Tanstack Query key: `['history', 'summary', filtersJSON]`.
  - `useHistorySessions(filters)` — derives the date-grouped, sorted list. Tanstack Query key: `['history', 'sessions', filtersJSON]`. Returns rows already enriched with `exerciseCount`, `setCount`, `volumeKg`, `durationMs`, `hasPr`.
- Filter state is parsed from / written to the URL via the existing routing layer; hooks accept the parsed object.
- Trade-off (documented): computing on every render over the full Dexie cache is fine for a single self-hosting user with bounded session count (hundreds, not millions). If lists grow beyond ~5k sessions we can add a memo layer or a tiny derived `historySummary` Dexie store later. **No premature optimization in v1.**

### Reusability Opportunities

- Reuse top-bar shell from `/exercises`.
- Reuse filter chip row primitive from `/exercises`.
- Reuse virtualized list scaffold (when introduced for routines/exercises) — fall back to plain mapping if not yet abstracted.
- Reuse Epley / PR-detection helper from workout-sessions; do not duplicate.
- Reuse Dexie + Tanstack Query patterns from `src/client/db/queries.ts`.

### Scope Boundaries

**In Scope**
- `/history` page with 5 aggregation tiles, filter chips, search, date-grouped session list, virtualized rows, URL-encoded filter state.
- Two read-only API endpoints under `/api/v1/history`.
- Two Dexie-backed Tanstack Query hooks (`useHistorySummary`, `useHistorySessions`).
- Empty / loading / no-match states.
- Linking each row to the existing `/sessions/:id` post-finish detail.
- Replacing the pill-heavy history summary format with the dense layout from the mockup (per PRODUCT-PLAN tasklist item).

**Out of Scope**
- Per-exercise history page (lives in workout-sessions on `/exercises/:id`).
- Goals progress.
- Charts / trend lines beyond the per-exercise 1RM trend already in workout-sessions.
- Exporting from history (export is its own slice).
- Editing or deleting historical sessions (immutable per workout-sessions).
- Aggregation tables, server-side caching, materialized views.
- New Drizzle tables, new Dexie stores, new outbox entities, new mutations.
- Multi-user filtering, sharing, public history.
- Settings-driven units UI (display hardcoded kg in v1).

### Technical Considerations

**Assumptions (documented for spec-writer)**
- **A1: Skipped sets are excluded from TOTAL SETS.** Orchestrator phrasing was "total sets logged (excluding skipped)". Extras (`status='extra'`) are also excluded — only `status='logged'` counts. Spec-writer may revisit if extras should count toward sets-logged.
- **A2: Volume includes drop/amrap/failure rows alongside normal.** Matches "real work performed" intuition. Excludes warmups, skipped, extras, cardio-only (no `weightKg`/`reps`).
- **A3: Total exercises is summed per-session distinct count, not cross-session distinct.** PRD says "total exercises completed" — interpreted as throughput (e.g., 5 distinct exercises this session + 5 distinct next session = 10), not unique-across-history (which would saturate quickly and be useless as a progress metric).
- **A4: Total time uses `endedAt - startedAt` for finished sessions only.** No subtraction of pause windows in v1 (workout-sessions notes `pausedAt` is best-effort/informational).
- **A5: PR detection reuses Epley + the per-exercise history rule from workout-sessions** — a session has a PR if any of its logged-normal sets produces an EST 1RM higher than the max EST 1RM across all prior finished sessions for that `exerciseId`. Computed on read; not persisted.
- **A6: Display hardcoded to kg in v1.** Future Settings slice flips by reading the global unit preference; volume tile and per-row volume become display-converted at render time.
- **A7: Date grouping uses the user's local time zone derived per render.** Stored timestamps are UTC ms; group key = local YYYY-MM-DD. Acceptable trade-off for a single-user self-hosted app.
- **A8: The five-tile layout wraps to two rows on narrow widths.** Mockup shows three tiles; PRD requires five — the two extra (TOTAL SETS, TOTAL EXERCISES) wrap below on mobile.
- **A9: Filter chips are single-select.** Simpler URL encoding, simpler queries. Multi-select can be added later without breaking URL keys.
- **A10: `/history` route name** is preferred over `/sessions` (workout-sessions owns `/sessions/:id` for the detail). `/history` is the user-facing list surface; the canonical detail URL stays `/sessions/:id`.

**Integration points**
- Reads the `sessions` + `session_set_logs` tables from workout-sessions. Must NOT add columns to either.
- Reads `routines` (for routine-name lookup) and `programs` (for program-name + week labels) tables defined in their own slices.
- Mounts under the existing app shell; adds a sidebar/drawer entry "History".

**Existing system constraints**
- Single-user, self-hosted. Bounded data volume. Computing aggregates per render over Dexie is acceptable.
- Offline-first: every aggregate must be derivable from local Dexie data alone. Server endpoint exists for parity / scripting via `/api/v1`, not as the primary data source.
- No bearer-token auth on `/api/v1/history` (matches sibling slices' deferral).

**Technology preferences**
- Drizzle / Hono / Bun / SQLite on the server (no schema changes).
- React + Tanstack Query + Dexie on the client.
- Zod schemas in `src/shared/history.ts` for the response payloads (`SessionSummarySchema`, `HistorySummarySchema`, `HistoryFilterSchema`). Filter schema doubles as the query-string parser.

**Similar code patterns to follow**
- `specs/exercise-library` — page shell, list density, filter chip row, search input, URL state.
- `specs/workout-sessions` — Epley helper, PR detection, post-finish detail link target.
- `src/client/db/queries.ts` — Dexie + Tanstack Query hook conventions.
- `src/server/routes/api.ts` — Hono sub-router registration; add `src/server/routes/history.ts`.
