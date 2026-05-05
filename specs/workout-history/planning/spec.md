# Specification: Workout History

## Overview

Workout History is a **read-only view layer** over the `sessions` and `session_set_logs` tables already defined in `specs/workout-sessions/planning/spec.md`. It introduces no new tables, no new Dexie stores, no new outbox entities, and no new mutations. The slice ships a single `/history` page composed of five lifetime aggregation tiles, a filter chip row (date range / routine / program / contains-exercise / search), and a date-grouped, virtualized list of finished sessions. It also exposes two read-only endpoints under `/api/v1/history` for parity / scripting; the primary data path is Dexie-derived. Each list row deep-links to `/sessions/:id`, the post-finish session detail surface owned by workout-sessions. This closes the gap left in workout-sessions, which deferred history-list aggregations and date-range filtering. Visual reference: `design/history-list.png` (authoritative).

## Goals

- Surface every finished session (routine-driven, program-driven, freeform) in one dense, scannable, mockup-faithful list.
- Provide five lifetime aggregation tiles (sessions, volume, sets, exercises, time) computed on read over the active filter set.
- Let the user narrow by date range, source routine, source program, contained exercise, and free-text search — with all state shareable via the URL.
- Reuse the exercise-library page shell, filter chip row, and Dexie + Tanstack Query hook conventions verbatim.
- Stay strictly read-only: history is immutable, edits live only inside an in-progress session.

## Non-goals (v1)

- New Drizzle tables, Dexie stores, outbox entities, server-side aggregation tables, or materialized views.
- Per-exercise history page (`/exercises/:id`) — owned by workout-sessions.
- Per-session detail (`/sessions/:id`) — owned by workout-sessions; this slice only links into it.
- Goals progress, dashboards, weekly volume charts, streak counters, calendar heatmaps.
- Editing or deleting historical sessions; export from history; multi-select filters.
- Settings-driven units UI — display hardcodes `kg` in v1.
- Bearer-token auth on `/api/v1/history` (consistent deferral with sibling slices).

## User Stories

- As a self-tracking lifter, I want a single dense list of every finished session, so I can scan months of training at a glance.
- As a data-curious user, I want lifetime aggregation tiles that recompute when I filter, so I can see how a date range or a specific routine adds up.
- As a returning user, I want shareable, back-button-friendly URLs with my filter state, so I can bookmark "this month's leg work" without re-clicking chips.

## Specific Requirements

**Data sources (existing, no schema changes)**
- Reads `sessions` rows where `status='finished'` only. `'in_progress'` is hidden; `'discarded'` is hard-deleted in workout-sessions and cannot appear.
- Reads `session_set_logs` joined to `sessions` for per-row counters and aggregations.
- Lookups: `routines.title` (for source-routine filter and row subtitle fallback), `programs.name` + week index (for the `<programName> · Week <n>` subtitle line and source-program filter).
- Authoritative column definitions live in `specs/workout-sessions/planning/spec.md` — this slice MUST NOT add columns to either table.

**Zod schemas (`src/shared/history.ts`)**
- `HistoryFilterSchema` — `{ range: 'all'|'week'|'month'|'year'|'custom', from?: number, to?: number, routine?: uuid, program?: uuid, exercise?: uuid, q?: string, cursor?: string, limit?: number }`. Doubles as the URL query-string parser; defaults are stripped from the URL.
- `SessionSummarySchema` — `{ id: uuid, title: string|null, sourceType: SessionSourceTypeEnum, sourceRoutineId: uuid|null, sourceRoutineName: string|null, sourceProgramId: uuid|null, sourceProgramName: string|null, sourceProgramWeekIndex: number|null, sourceProgramDayIndex: number|null, startedAt: number, endedAt: number, exerciseCount: number, setCount: number, volumeKg: number, durationMs: number, hasPr: boolean }`.
- `HistorySummarySchema` — `{ totalSessions: number, totalVolumeKg: number, totalSets: number, totalExercises: number, totalDurationMs: number }`.
- `HistorySessionsResponseSchema` — `{ sessions: SessionSummary[], nextCursor: string | null }`.
- All schemas exported from `src/shared/history.ts` and consumed by both client hooks and Hono route validators.

**HTTP API (`/api/v1/history`)**
- All routes under a new `src/server/routes/history.ts` Hono sub-router; no auth gate; JSON in/out.
- `GET /api/v1/history/sessions` — query params: `range`, `from`, `to`, `routine`, `program`, `exercise`, `q`, `cursor`, `limit` (default 50, max 200). Returns `200 HistorySessionsResponse`. Cursor encodes `(endedAt, id)` for stable `endedAt DESC, id DESC` pagination. Server SQL aggregates per-row counters via `session_set_logs` joins; only returns `status='finished'` sessions. `400` on invalid filters.
- Example response: `{ "sessions": [{ "id": "sess-1", "title": "Push Day A", "sourceType": "routine", "sourceRoutineId": "r-1", "sourceRoutineName": "Push Day A", "sourceProgramId": "p-1", "sourceProgramName": "Hypertrophy Block", "sourceProgramWeekIndex": 2, "sourceProgramDayIndex": 0, "startedAt": 1714600000000, "endedAt": 1714603120000, "exerciseCount": 5, "setCount": 18, "volumeKg": 4820.5, "durationMs": 3120000, "hasPr": true }], "nextCursor": "1714600000000:sess-1" }`.
- `GET /api/v1/history/summary` — same filter params. Returns `200 HistorySummary`. Example: `{ "totalSessions": 42, "totalVolumeKg": 112650.0, "totalSets": 786, "totalExercises": 213, "totalDurationMs": 138420000 }`.
- Reuses existing `GET /api/v1/sessions/:id` and `GET /api/v1/sessions/:id/logs` from workout-sessions for the per-session detail surface; this slice does not redefine them.

**Dexie hooks (`src/client`)**
- `useHistorySessions(filters)` — Tanstack Query key `['history', 'sessions', filtersJSON]`. Wraps a Dexie `useLiveQuery` over `sessions` (filtered to `status='finished'`) joined client-side to `sessionSetLogs`, then enriched per row with `exerciseCount`, `setCount`, `volumeKg`, `durationMs`, `hasPr`. Returns the date-grouped, sorted list (by `endedAt DESC`, tiebreak `startedAt DESC`).
- `useHistorySummary(filters)` — Tanstack Query key `['history', 'summary', filtersJSON]`. Derives the five aggregates from the same filtered Dexie scan.
- Both hooks accept the parsed `HistoryFilterSchema` object; the routing layer parses/serializes the URL query string.
- Read-only: hooks never write to Dexie or enqueue outbox entries.
- PR detection inside `useHistorySessions` reuses the Epley + per-exercise peak helper exported by workout-sessions; do not duplicate.

**Aggregation formulas (lifetime + filtered, identical math)**
- `totalSessions` = count of `sessions` matching filters with `status='finished'`.
- `totalVolumeKg` = sum of `weightKg * reps` across `session_set_logs` where parent session matches filters AND `status='logged'` AND `setType IN ('normal','drop','amrap','failure')` AND `reps > 0` AND `weightKg > 0`.
- `totalSets` = count of `session_set_logs` where parent session matches filters AND `status='logged'` (excludes `'skipped'` and `'extra'`).
- `totalExercises` = sum across matching sessions of distinct `exerciseId` values having ≥1 `status='logged'` log in that session (per-session distinct, not cross-session distinct).
- `totalDurationMs` = sum of `endedAt - startedAt` across matching `status='finished'` sessions; rendered as `Hh Mm`. Pause windows are not subtracted (workout-sessions notes `pausedAt` is informational).
- `hasPr` per row = true iff any logged-normal set in this session produces an Epley estimate strictly greater than the max Epley across all prior finished sessions for that `exerciseId`.

**Filtering semantics (URL-encoded; AND together)**
- `range`: `all` (default, omitted from URL) | `week` | `month` | `year` | `custom`. Computed against `endedAt` in the user's local time zone, derived per render. `custom` requires `from` and `to` (ms timestamps; inclusive on both ends).
- `routine`: single routine UUID. Matches sessions where `sourceRoutineId` equals the value. Filter dropdown is populated from Dexie routines that have ≥1 finished session.
- `program`: single program UUID. Matches sessions where `sourceProgramId` equals the value.
- `exercise`: single exercise UUID. Matches sessions with ≥1 `session_set_logs` row for that `exerciseId` (any status).
- `q`: case-insensitive, trimmed substring over `sessions.title` and `sessions.notes`. SQL `LIKE` on the server; identical Dexie scan client-side.
- All filters AND with each other. Both the list and the aggregation tiles consume the same filter set. Active chips show a count badge of remaining sessions.

**UX (`/history`, ref `design/history-list.png`)**
- Top bar: hamburger left, amber **HISTORY** title, search icon right (toggles inline search input bound to `q`). Reuses the `/exercises` top-bar shell.
- Aggregation tiles strip directly under the top bar: five tiles in declared order — TOTAL SESSIONS, TOTAL VOLUME (kg), TOTAL SETS, TOTAL EXERCISES COMPLETED, TOTAL TIME (`Hh Mm`). Mockup shows three; the layout wraps to two rows on narrow widths.
- Filter chip row immediately under the tiles: `ALL` (active amber fill, default), `THIS WEEK`, `THIS MONTH`, `THIS YEAR`, `CUSTOM` (opens date-range picker), then `ROUTINE`, `PROGRAM`, `EXERCISE` chips that open single-select sheets. Single horizontal-scrolling row, reusing the `/exercises` chip primitive.
- Date-grouped, virtualized list under the chips: sticky muted day headers (`APR 23 · WEDNESDAY`); group key derived per render from `endedAt` in local time zone.
- Row composition: amber-bordered day-number tile (filled amber for the most recent session and for PR sessions); bold routine name (or `"Freeform"` for `sourceType='freeform'`); muted subtitle `<programName> · Week <n>` when `sourceType='program_day'`, hidden otherwise; muted micro-line `<exCount> EXERCISES · <setCount> SETS · <durationMin> MIN`; trailing amber `PR` pill when `hasPr`; trailing chevron. Tap → `/sessions/:id` (workout-sessions detail surface).
- States: empty — "No sessions yet — finish a workout to see history here."; filtered-zero — inline "No matches" row with "Clear filters" button; loading — skeleton rows.
- URL state: filter object serialized to `?range=…&from=…&to=…&routine=…&program=…&exercise=…&q=…&cursor=…`. Defaults stripped. Back/forward and share preserve the exact view.

**Read-only enforcement**
- No mutation affordances on the page (no edit, no delete, no rename, no inline notes). Discard/finish/edit live in workout-sessions during a session's `in_progress` phase only.
- Server endpoints under `/api/v1/history` are GET-only. POST/PATCH/DELETE return `405`.

## Visual Design

**`design/history-list.png` (authoritative, high-fidelity dark mode)**
- Top bar: hamburger left, amber **HISTORY** title, search icon right.
- Stats strip: tiles row with oversized tabular numerics (mockup shows three: `THIS MONTH`, `VOLUME`, `AVG DURATION`; v1 ships five and wraps).
- Filter chip row: `ALL` active amber-filled, `THIS WEEK`, `THIS MONTH`, … horizontally scrollable; reuses `/exercises` chip styling.
- Sticky muted day headers (`APR 23 · WEDNESDAY`) over grouped rows.
- Each row: amber-bordered day-number tile left (filled amber on most-recent and PR sessions); bold routine name center-top; muted `Hypertrophy Block · Week 3` subtitle; muted micro-line `5 EXERCISES · 18 SETS · 52 MIN`; amber `PR` pill + chevron right.
- Freeform sessions render with `Freeform` as the title and notes/title as the subtitle.
- No bottom tab bar. Detail link target is `/sessions/:id`, not redefined here.

## Existing Code to Leverage

**`specs/workout-sessions/planning/spec.md` (authoritative for tables & detail page)**
- `sessions` and `session_set_logs` Drizzle tables, `SessionSchema` / `SessionSetLogSchema` Zod, and the post-finish detail at `/sessions/:id` are reused as-is. Do NOT redefine.
- Reuse the exported Epley helper and per-exercise PR-detection rule for `hasPr`.
- Reuse `GET /api/v1/sessions/:id` and `GET /api/v1/sessions/:id/logs` for row deep-links and any per-session reads.

**`specs/exercise-library/planning/spec.md` (page shell pattern)**
- Mirror the top-bar layout, the single horizontal-scrolling filter chip row, the search-input toggle, the empty/loading/no-match state copy structure, and the URL-state-driven filter conventions.
- Reuse the `{ error, issues?, id?, name? }` server error shape and the Dexie + Tanstack Query read pattern from `src/client/db/queries.ts`.

**`specs/routines/planning/spec.md` and `specs/programs/planning/spec.md`**
- Read `routines.title` for the source-routine filter list and any title fallback.
- Read `programs.name` + week index for the row subtitle (`<programName> · Week <n>`) and source-program filter list.

**`src/server/routes/api.ts` Hono scaffold**
- Register a new `src/server/routes/history.ts` sub-router under `/api/v1/history` following the `exercises.ts` / `sessions.ts` convention. No schema changes.

**`src/client/db/forge-db.ts` and `src/client/db/queries.ts`**
- Reuse the existing `sessions` and `sessionSetLogs` Dexie stores verbatim. Reuse `useLiveQuery` + Tanstack Query patterns for `useHistorySessions` and `useHistorySummary`.

## Out of Scope

- New Drizzle tables, new Dexie stores, new outbox entities, new mutations, server-side aggregation tables, or materialized views.
- Per-exercise history page at `/exercises/:id` (owned by workout-sessions).
- Per-session detail page at `/sessions/:id` (owned by workout-sessions; this slice only links into it).
- Editing or deleting historical sessions; sessions are immutable post-finish.
- Goals progress, weekly volume charts, streak counters, calendar heatmaps, dashboard tiles beyond the five aggregations.
- Trend lines beyond the per-exercise 1RM trend already specced in workout-sessions.
- Export functionality from history (export is its own slice).
- Multi-select filter chips for routine / program / exercise (single-select only in v1).
- Settings-driven unit display; v1 hardcodes `kg`.
- Bearer-token auth on `/api/v1/history`.
