# Task Breakdown: Workout History

## Status (last updated 2026-05-04)

**Not started.** Read-only view layer over existing `sessions` and `session_set_logs` tables (owned by workout-sessions). No schema changes.

Status legend: `[x]` done, `[~]` partial, `[ ]` not started.

### Phase status

- [ ] Phase 1 — Shared Zod schemas
- [ ] Phase 2 — Hono read-only routes under `/api/v1/history`
- [ ] Phase 3 — Dexie query helpers + Tanstack Query hooks
- [ ] Phase 4 — `/history` list page UI (tiles + chips + dense list)
- [ ] Phase 5 — Empty / loading / error states + dense layout polish
- [ ] Phase 6 — Manual verification against `design/history-list.png`

---

## Overview

Workout History ships a single `/history` page composed of five lifetime aggregation tiles, a filter chip row (date range / routine / program / contained-exercise / search), and a date-grouped list of finished sessions. Strictly read-only: no new tables, no Dexie stores, no outbox entries, no mutations. Reuses the `/exercises` page shell, chip primitive, and Dexie + Tanstack Query patterns verbatim.

Visual reference: `/home/mike/Development/Forge/design/history-list.png` (authoritative).
Authoritative spec: `/home/mike/Development/Forge/specs/workout-history/planning/spec.md`.

Total Tasks: ~38 (across 6 phases)

---

## Phase 1: Shared (Zod schemas + derived types)

**Dependencies:** workout-sessions Phase 1 (`SessionSchema`, `SessionSetLogSchema`, `SessionSourceTypeEnum`) must already exist in `src/shared/`.

### 1.1 [ ] Define `HistoryFilterSchema`
- `{ range: 'all'|'week'|'month'|'year'|'custom', from?: number, to?: number, routine?: uuid, program?: uuid, exercise?: uuid, q?: string, cursor?: string, limit?: number }`.
- Default `range='all'`, `limit=50` (max 200). `custom` requires both `from` and `to` (refine).
- Doubles as URL query-string parser; export `parseHistoryFilterFromSearchParams(URLSearchParams)` and `historyFilterToSearchParams(filter)` helpers that strip defaults from URLs.
- Files: `src/shared/history.ts` (new), `src/shared/index.ts` (barrel).

### 1.2 [ ] Define `SessionSummarySchema`
- `{ id: uuid, title: string|null, sourceType: SessionSourceTypeEnum, sourceRoutineId: uuid|null, sourceRoutineName: string|null, sourceProgramId: uuid|null, sourceProgramName: string|null, sourceProgramWeekIndex: number|null, sourceProgramDayIndex: number|null, startedAt: number, endedAt: number, exerciseCount: number, setCount: number, volumeKg: number, durationMs: number, hasPr: boolean }`.
- Files: `src/shared/history.ts`.
- Depends on: 1.1.

### 1.3 [ ] Define `HistorySummarySchema`
- `{ totalSessions: number, totalVolumeKg: number, totalSets: number, totalExercises: number, totalDurationMs: number }`.
- Files: `src/shared/history.ts`.
- Depends on: 1.1.

### 1.4 [ ] Define `HistorySessionsResponseSchema`
- `{ sessions: SessionSummary[], nextCursor: string | null }`. Cursor format `${endedAt}:${id}`.
- Files: `src/shared/history.ts`.
- Depends on: 1.2.

### 1.5 [ ] Barrel re-export from `src/shared/index.ts`
- Done when: `import { HistoryFilterSchema, type SessionSummary } from '@/shared'` works from server and client.
- Files: `src/shared/index.ts`.
- Depends on: 1.1-1.4.

**Acceptance Criteria (Phase 1):** Schemas parse valid inputs, reject invalid (e.g. `range='custom'` without `from`/`to`); URL round-trip helper strips defaults; no Dexie/Drizzle/Hono imports in `src/shared/history.ts`.

---

## Phase 2: API (Hono read-only routes)

**Dependencies:** Phase 1, plus existing `sessions` + `session_set_logs` Drizzle tables (workout-sessions Phase 2).

### 2.1 [ ] Scaffold `src/server/routes/history.ts` sub-router
- Mount under `/api/v1/history` from `src/server/routes/api.ts`. No auth gate. JSON in/out. Reuse the shared error helper from `src/server/lib/errors.ts`.
- POST/PATCH/DELETE on any `/api/v1/history/*` route returns `405`.
- Files: `src/server/routes/history.ts` (new), `src/server/routes/api.ts`.

### 2.2 [ ] Implement `GET /api/v1/history/sessions`
- Validate query params with `HistoryFilterSchema`. Compute `endedAt` window from `range` server-side (UTC fallback; client passes pre-resolved `from`/`to` for `custom`).
- SQL: select `sessions` where `status='finished'` AND filter set; LEFT JOIN `routines` for `sourceRoutineName`; LEFT JOIN `programs` for `sourceProgramName`; aggregate per session via correlated subqueries on `session_set_logs` for `exerciseCount` (distinct `exerciseId` with ≥1 `status='logged'`), `setCount` (count where `status='logged'`), `volumeKg` (sum `weightKg*reps` where `status='logged'` AND `setType IN ('normal','drop','amrap','failure')` AND `reps>0` AND `weightKg>0`).
- `durationMs = endedAt - startedAt`. `hasPr` computed in a separate pass using the Epley helper from workout-sessions (server-side reuse the exported helper module).
- Pagination: `endedAt DESC, id DESC`; cursor decodes to `(endedAt, id)`; `limit` defaulted to 50, capped at 200.
- `400` on invalid filters with `{ error, issues }`. `200` returns `HistorySessionsResponse`.
- Files: `src/server/routes/history.ts`.
- Depends on: 2.1.

### 2.3 [ ] Implement `GET /api/v1/history/summary`
- Same filter params; returns `HistorySummary`. Computes the five aggregates over the same filtered set using the formulas from spec §"Aggregation formulas".
- Files: `src/server/routes/history.ts`.
- Depends on: 2.1.

### 2.4 [ ] Manual curl verification
- Done when: `GET /api/v1/history/sessions?range=month`, `?routine=…`, `?exercise=…`, `?q=push`, `?range=custom&from=…&to=…` all return spec-conformant JSON; `POST /api/v1/history/sessions` returns 405; invalid filter returns 400.
- Depends on: 2.2, 2.3.

**Acceptance Criteria (Phase 2):** Both endpoints honor every filter dimension, paginate stably by `(endedAt, id)`, and refuse mutating verbs with 405. Aggregations match the spec formulas exactly.

---

## Phase 3: Client storage (Dexie query helpers + hooks)

**Dependencies:** Phase 1; existing Dexie `sessions` + `sessionSetLogs` stores (workout-sessions Phase 4). No schema changes.

### 3.1 [ ] Dexie read helpers in `src/client/db/queries.ts`
- Add `listFinishedSessionsForHistory(filter)`: scans Dexie `sessions` where `status='finished'`, filters in-memory by `range`/`from`/`to`/`routine`/`program`/`q` (substring over `title`+`notes`, case-insensitive), then for `exercise` filter joins to `sessionSetLogs` to keep only sessions with ≥1 row for that `exerciseId`.
- Add `enrichSessionSummary(sessionRow, logRows, priorPeaksByExerciseId)`: returns a `SessionSummary` shaped row using the same formulas as the server.
- Add `computeHistorySummary(filter)`: returns `HistorySummary` over the same filtered Dexie scan.
- Reuse the Epley + per-exercise peak helper exported by workout-sessions (`src/client/db/sessions/pr.ts` or wherever it lives) — do NOT duplicate.
- Files: `src/client/db/queries.ts`, `src/client/db/query-keys.ts` (add `historyKeys`).
- Depends on: existing workout-sessions Dexie helpers.

### 3.2 [ ] `useHistorySessions(filter)` hook
- Tanstack Query key `['history', 'sessions', filtersJSON]`. Wraps `useLiveQuery` over `sessions` + `sessionSetLogs`. Returns the date-grouped, sorted list (`endedAt DESC` → `startedAt DESC`).
- Read-only: never writes Dexie or enqueues outbox entries.
- Files: `src/client/hooks/use-history-sessions.ts` (new).
- Depends on: 3.1.

### 3.3 [ ] `useHistorySummary(filter)` hook
- Tanstack Query key `['history', 'summary', filtersJSON]`. Derives the five aggregates from the same filtered Dexie scan.
- Files: `src/client/hooks/use-history-summary.ts` (new).
- Depends on: 3.1.

### 3.4 [ ] `useHistoryRoutineOptions()` and `useHistoryProgramOptions()` hooks
- Populate the routine/program filter dropdowns from Dexie routines/programs that have ≥1 finished session referencing them. Tanstack Query keys `['history','routineOptions']` and `['history','programOptions']`.
- Files: `src/client/hooks/use-history-options.ts` (new).
- Depends on: 3.1.

**Acceptance Criteria (Phase 3):** Hooks return spec-shaped data offline-first from Dexie; aggregates match the server's formulas; PR detection reuses workout-sessions' helper; no writes hit Dexie or the outbox.

---

## Phase 4: UI — `/history` list page

**Dependencies:** Phase 3, app-shell + chip primitive from exercise-library Phase 6. Matches `design/history-list.png`.

### 4.1 [ ] Route + page skeleton
- Register `/history` in the router with `<HistoryListPage />`. Reuse the `/exercises` top-bar shell: hamburger left, amber **HISTORY** title, search icon right.
- Add "History" entry to the drawer nav.
- Files: `src/client/pages/history/list.tsx` (new), `src/client/main.tsx` (router config), drawer component.

### 4.2 [ ] URL-state-driven filter wiring
- Parse `?range=…&from=…&to=…&routine=…&program=…&exercise=…&q=…&cursor=…` into `HistoryFilterSchema` via the shared helper. Use `useSearchParams` from React Router; updates push new history entries (back/forward + share preserve view). Defaults are stripped from the URL.
- Files: `src/client/pages/history/use-history-filter.ts` (new).
- Depends on: 1.1, 4.1.

### 4.3 [ ] Aggregation tiles strip
- Five tiles in declared order — `TOTAL SESSIONS`, `TOTAL VOLUME` (kg), `TOTAL SETS`, `TOTAL EXERCISES COMPLETED`, `TOTAL TIME` (`Hh Mm`). Bound to `useHistorySummary(filter)`. Wraps to two rows on narrow widths.
- Oversized tabular numerics; muted small caps labels.
- Files: `src/client/pages/history/summary-tiles.tsx` (new).
- Depends on: 3.3, 4.2.

### 4.4 [ ] Search input toggle
- Search icon in the top bar toggles an inline search input bound to `q`. Trimmed, case-insensitive substring over session `title`+`notes`. Reuse the `/exercises` search component pattern.
- Files: `src/client/pages/history/search.tsx` (new).
- Depends on: 4.2.

### 4.5 [ ] Filter chip row
- Single horizontal-scrolling `role="toolbar"` reusing the `/exercises` chip primitive:
  - Date-range chips: `ALL` (default, amber-filled when active), `THIS WEEK`, `THIS MONTH`, `THIS YEAR`, `CUSTOM` (opens date-range picker sheet).
  - Source chips: `ROUTINE`, `PROGRAM`, `EXERCISE` — each opens a single-select bottom sheet populated by `useHistoryRoutineOptions` / `useHistoryProgramOptions` / Dexie exercises with ≥1 referenced log.
- Active chips show a count badge of remaining sessions when narrowing.
- Files: `src/client/pages/history/filter-chips.tsx` (new), `src/client/pages/history/custom-range-sheet.tsx` (new), `src/client/pages/history/source-filter-sheet.tsx` (new).
- Depends on: 3.4, 4.2.

### 4.6 [ ] Date-grouped, virtualized session list
- Group rows by local-time-zone day key derived from `endedAt`. Sticky muted day headers (`APR 23 · WEDNESDAY`).
- Virtualize the list (reuse the existing virtualization util if present; otherwise plain windowed rendering — do not pull in a new dep without consent).
- Files: `src/client/pages/history/session-list.tsx` (new), `src/client/pages/history/day-header.tsx` (new).
- Depends on: 3.2, 4.2.

### 4.7 [ ] Session row component
- Left: amber-bordered day-number tile (filled amber for the most recent finished session and for any session where `hasPr === true`).
- Center-top: bold routine name (or `Freeform` for `sourceType='freeform'`); muted subtitle `<programName> · Week <n>` only when `sourceType='program_day'` (hidden otherwise; for freeform, fall back to `notes`/`title` per spec §Visual Design).
- Center-bottom: muted micro-line `<exerciseCount> EXERCISES · <setCount> SETS · <durationMin> MIN`.
- Right: amber `PR` pill when `hasPr`; trailing chevron.
- Whole row is a `<Link to="/sessions/:id">` (workout-sessions detail surface). Composed `aria-label` for screen readers.
- Files: `src/client/pages/history/session-row.tsx` (new).
- Depends on: 4.6.

**Acceptance Criteria (Phase 4):** Page matches mockup density; tiles, chips, and list all consume the same filter state; URL round-trip works (back/forward + share); rows deep-link to `/sessions/:id`.

---

## Phase 5: Empty / loading / error states + dense layout polish

**Dependencies:** Phase 4.

### 5.1 [ ] Loading skeletons
- Tile strip skeleton (5 muted blocks); session-list skeleton rows (8-10) on first load.
- Files: `src/client/pages/history/skeletons.tsx` (new).

### 5.2 [ ] Empty + zero-match states
- Full-empty (no finished sessions): centered `No sessions yet — finish a workout to see history here.`
- Filtered-zero: inline `No matches` row with a `Clear filters` button that resets `range='all'` and clears all source filters and `q`.
- Files: `src/client/pages/history/empty-states.tsx` (new).
- Depends on: 4.5, 4.6.

### 5.3 [ ] Error fallback
- Graceful fallback paragraph when Dexie reads or the optional server fetch fail. Should never crash the page.
- Files: `src/client/pages/history/list.tsx`.

### 5.4 [ ] Dense layout polish
- Per PRODUCT-PLAN: replace any pill-heavy spacing with a denser layout. Audit chip row, tiles strip, and row vertical rhythm to match `design/history-list.png` density (compare side-by-side).
- Verify no dangling separators in the row subtitle when optional pieces (program subtitle, freeform notes) are missing.
- Files: `src/client/pages/history/*.tsx`, `src/client/styles.css` (only if a token genuinely fails contrast).

**Acceptance Criteria (Phase 5):** Every state (empty / filtered-zero / loading / error) renders the spec copy; layout density visually matches the mockup; no zero-valued or dangling decorations.

---

## Phase 6: Manual verification against mockups

**Dependencies:** Phases 1-5.

### 6.1 [ ] Manual test script
Run `bun run dev` with `design/history-list.png` open side-by-side and walk through:

- [ ] `/history` loads from Dexie offline; five tiles populate from finished sessions; defaults `range=all`.
- [ ] Apply `THIS MONTH` chip → tiles AND list both narrow; URL becomes `?range=month`.
- [ ] Apply `CUSTOM` with `from`/`to`: URL gains `?range=custom&from=…&to=…`; back button restores prior view.
- [ ] Apply `ROUTINE` filter (single select) → only sessions with that `sourceRoutineId` remain; chip shows count badge.
- [ ] Apply `PROGRAM` filter → narrows correctly; subtitle still renders `<programName> · Week <n>` on program-day sessions.
- [ ] Apply `EXERCISE` filter → only sessions with ≥1 log for that exercise.
- [ ] Toggle search; type a substring → `q` is trimmed, case-insensitive, matches `title` and `notes`.
- [ ] Combine all filters → AND semantics; tiles and list both reflect the same filter set.
- [ ] Filtered-zero shows `No matches` with a working `Clear filters` button.
- [ ] Sticky day headers render correctly while scrolling; virtualization smooth.
- [ ] Most-recent session row has filled amber day-tile; PR sessions also fill amber and show the `PR` pill.
- [ ] Freeform sessions render `Freeform` as title with notes/title as subtitle.
- [ ] Tap a row → routes to `/sessions/:id` (workout-sessions detail) with no errors.
- [ ] `GET /api/v1/history/sessions?...` and `GET /api/v1/history/summary?...` return spec-shaped JSON for the same filters.
- [ ] `POST /api/v1/history/sessions` returns `405`.
- [ ] Share the URL → opening it in a new tab restores the exact filter state.
- [ ] No mutation affordances anywhere on the page (no edit/delete/rename/inline-notes).
- [ ] Density and layout visually match `design/history-list.png`.

**Acceptance Criteria (Phase 6):** Every checklist item passes; the page visually matches the mockup in structure, density, and styling.

---

## Execution Order (recommended)

1. Shared schemas (Phase 1)
2. Hono read-only routes (Phase 2)
3. Dexie helpers + hooks (Phase 3)
4. `/history` list page (Phase 4)
5. States + density polish (Phase 5)
6. Manual verification (Phase 6)
