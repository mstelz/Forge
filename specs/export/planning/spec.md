# Specification: Export & API Surface

## Overview

A single `GET /api/v1/export` endpoint plus a single nav-footer affordance ship a versioned JSON dump of all user-owned data: exercises, equipment, routines, programs (`programs` + `program_days` + `program_runs` + `program_run_day_states`), workout sessions (`sessions` + `session_set_logs`), goals, and `settings` (when that table exists). Server-side dump is authoritative; the client falls back to a Dexie dump when offline. The slice introduces no new tables, no new outbox entities, no new mutations. It also documents the union of `/api/v1` CRUD endpoints already specced across sibling slices and removes every public-docs reference to `WORKOUT_DASH_API_TOKEN` (auth deferred consistently with sibling slices).

## Goals

- One-tap download of `forge-export-YYYY-MM-DD.json` from the sidebar footer (desktop) or drawer footer (mobile).
- Versioned, schema-tagged envelope (`{ schemaVersion: 1, exportedAt, source, appVersion, entities }`) so external scripts have a stable contract.
- Server-side dump by default (single SQLite read transaction → consistent snapshot); Dexie fallback when offline or on server failure.
- Single `EXPORT_REGISTRY` is the source of truth for "what's in the export"; future entities add one line.
- Document the union of `/api/v1` endpoints in one place; remove the `WORKOUT_DASH_API_TOKEN` leak from public docs.

## Non-goals (v1)

- Import (reverse direction).
- Selective / per-entity exports; compression / streaming / chunked downloads; encryption; cloud / S3 push.
- Bearer-token auth on `/api/v1/export` (deferred consistently). Endpoint is open in v1.
- Per-user isolation; multi-user accounts.
- Scheduled / automated exports; "last exported at" indicators.
- Schema-version migration tooling (no v0 to migrate from).

## User flows

1. **Desktop happy path.** User clicks the sidebar footer **Export JSON** link → online → client issues `GET /api/v1/export` → server reads every registry table inside one SQLite read transaction → returns pretty-printed envelope with `source: 'server'` and `Content-Disposition: attachment; filename="forge-export-2026-05-04.json"` → browser saves the file.
2. **Mobile happy path.** Same as above, triggered from the slide-out drawer footer.
3. **Offline / server error.** Online check fails OR the request returns non-200 → client reads every registry Dexie store, assembles an envelope with `source: 'client'`, validates each entity through its Zod schema, pretty-prints, and triggers the download via `Blob` + `URL.createObjectURL`. No retry of the server path during the same tap.
4. **Validation warnings.** Server-side: any entity that fails Zod parse is excluded from `entities.<key>` and noted in `_warnings`. Client-side: same. Download proceeds; warnings are advisory.
5. **Total failure.** Both paths throw → toast `Export failed — try again` with the error message; no file is written.

## Data model

No new tables. No new Dexie stores. No new outbox entities. No migrations.

### Export envelope (canonical Zod, `src/shared/export.ts`)

```ts
export const ExportEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.number().int(),
  source: z.enum(['server', 'client']),
  appVersion: z.string().min(1),
  entities: z.object({
    exercises: z.array(ExerciseSchema),
    equipment: z.array(EquipmentSchema),
    routines: z.array(RoutineSchema),
    routineExercises: z.array(RoutineExerciseSchema).optional(),
    programs: z.array(ProgramSchema),
    programDays: z.array(ProgramDaySchema),
    programRuns: z.array(ProgramRunSchema),
    programRunDayStates: z.array(ProgramRunDayStateSchema),
    sessions: z.array(SessionSchema),
    sessionSetLogs: z.array(SessionSetLogSchema),
    goals: z.array(GoalSchema),
    settings: SettingsSchema.optional(),
  }),
  _warnings: z.array(z.string()).optional(),
});
export type ExportEnvelope = z.infer<typeof ExportEnvelopeSchema>;
```

- `routineExercises` and `settings` are `.optional()` — emitted only if the underlying table/store exists at export time.
- `_warnings` is omitted when there are none (to keep clean files clean).

### Export registry (`src/shared/export/registry.ts`)

```ts
export const EXPORT_REGISTRY = [
  { key: 'exercises',           drizzleTable: exercises,           dexieStore: 'exercises',           schema: ExerciseSchema },
  { key: 'equipment',           drizzleTable: equipment,           dexieStore: 'equipment',           schema: EquipmentSchema },
  { key: 'routines',            drizzleTable: routines,            dexieStore: 'routines',            schema: RoutineSchema },
  { key: 'routineExercises',    drizzleTable: routineExercises,    dexieStore: 'routineExercises',    schema: RoutineExerciseSchema, optional: true },
  { key: 'programs',            drizzleTable: programs,            dexieStore: 'programs',            schema: ProgramSchema },
  { key: 'programDays',         drizzleTable: programDays,         dexieStore: 'programDays',         schema: ProgramDaySchema },
  { key: 'programRuns',         drizzleTable: programRuns,         dexieStore: 'programRuns',         schema: ProgramRunSchema },
  { key: 'programRunDayStates', drizzleTable: programRunDayStates, dexieStore: 'programRunDayStates', schema: ProgramRunDayStateSchema },
  { key: 'sessions',            drizzleTable: sessions,            dexieStore: 'sessions',            schema: SessionSchema },
  { key: 'sessionSetLogs',      drizzleTable: sessionSetLogs,      dexieStore: 'sessionSetLogs',      schema: SessionSetLogSchema },
  { key: 'goals',               drizzleTable: goals,               dexieStore: 'goals',               schema: GoalSchema },
  { key: 'settings',            drizzleTable: settings,            dexieStore: 'settings',            schema: SettingsSchema, optional: true, singleton: true },
] as const;
```

- `optional: true` entries are skipped (not emitted as empty arrays) when the underlying table/store does not exist or is missing in the deployment.
- `singleton: true` (settings) emits a single object under `entities.settings` rather than an array.

`pending_writes` is intentionally absent — it is in-flight outbox state, not user-owned data.

## API surface

### `GET /api/v1/export`

- Hono route in `src/server/routes/export.ts`, mounted under `/api/v1`.
- Reads every registry table inside one `db.transaction(...)` block (read-only) so the snapshot is internally consistent.
- Each table's rows are validated through the corresponding Zod schema; rows that fail are dropped and a string is appended to `_warnings` (e.g., `"exercises[42]: name required"`).
- Returns `200 application/json` with the pretty-printed (2-space indent) envelope. Sets `Content-Disposition: attachment; filename="forge-export-YYYY-MM-DD.json"` (date computed from server's local time).
- `500 { error: 'export_failed', detail: string }` on a transaction or assembly failure (logged server-side; no partial file).
- Method allowlist: only `GET`; everything else returns `405`.

### Consolidated `/api/v1` surface (documentation only)

This is the canonical reference for the project's HTTP surface. Path-level details live in each owner spec; this table is the union.

| Resource | Endpoints | Owner spec |
|---|---|---|
| Exercises | `GET /exercises`, `POST /exercises`, `GET/PATCH/DELETE /exercises/:id` | `specs/exercise-library/` |
| Equipment | `GET /equipment`, `POST /equipment`, `GET/PATCH/DELETE /equipment/:id` | `specs/exercise-library/` |
| Routines | `GET /routines`, `POST /routines`, `GET/PATCH/DELETE /routines/:id` | `specs/routines/` |
| Programs | `GET /programs`, `POST /programs`, `GET/PATCH/DELETE /programs/:id` | `specs/programs/` |
| Program runs | `GET /program-runs`, `POST /program-runs`, `GET/PATCH/DELETE /program-runs/:id` | `specs/programs/` |
| Sessions | `GET /sessions`, `POST /sessions`, `GET/PATCH/DELETE /sessions/:id`, `POST/PATCH/DELETE /sessions/:id/logs/:logId` | `specs/workout-sessions/` |
| History | `GET /history/sessions`, `GET /history/summary` (read-only) | `specs/workout-history/` |
| Goals | `GET /goals`, `POST /goals`, `GET/PATCH/DELETE /goals/:id` | `specs/goals/` |
| Export | `GET /export` | this spec |

If a path string above disagrees with the owner spec, the owner spec is authoritative; this table is documentation derived from the canon.

### Shared error envelope (canonical)

Every `/api/v1` route returns errors as `{ error: string, issues?: ZodIssue[], id?: string, currentUpdatedAt?: number }`. Established by exercise-library; referenced unchanged.

### Auth posture

- v1: **no auth gate** anywhere on `/api/v1`, including `/api/v1/export`.
- `WORKOUT_DASH_API_TOKEN` is **removed from public-facing docs** in this slice and is **not honored** in v1. If the variable still exists in code, it becomes a no-op (with a comment pointing to deferred auth work) or is deleted outright.
- When auth lands post-v1, the export endpoint relocates to `/api/v1/admin/export`; envelope shape is unchanged.

## UI surface

There is no dedicated page. The export is reachable from a single nav affordance.

### Sidebar / drawer footer entry

- Label: `Export JSON`. Small download glyph (lucide `download`) at left.
- Desktop sidebar: anchored to the bottom of the sidebar with a hairline divider above; sits below all main nav items regardless of scroll.
- Mobile drawer: appears at the bottom of the slide-out drawer below all other items; identical styling to the desktop footer.
- Both placements come directly from `docs/PRODUCT-PLAN.md` (lines 41–45, 70–72).

### Trigger behavior

1. User taps **Export JSON**.
2. Online check (`navigator.onLine`):
   - **Online:** issue `GET /api/v1/export` via `fetch`. On 200, read the response as a `Blob`, create an `<a>` with the blob URL, set `download` to the `Content-Disposition` filename (or the client fallback `forge-export-YYYY-MM-DD.json`), and click it. Revoke the blob URL after the click.
   - **Offline (or fetch throws / non-200):** read every registry Dexie store via `db.<store>.toArray()` (or `.get()` for singletons), assemble the envelope with `source: 'client'`, validate each entity through its Zod schema (drop failures, append `_warnings`), pretty-print, and trigger the same blob download.
3. No confirmation dialog. No progress indicator. No retry of the server path during the same tap.
4. On total failure (both paths throw): toast `Export failed — try again` with the error message; no file is written.

### Filename

`forge-export-YYYY-MM-DD.json`, where `YYYY-MM-DD` is the local date at export time. Server sets it via `Content-Disposition`; client fallback computes it identically. Two exports on the same UTC day from different time zones may carry different names — accepted in single-user v1.

## Search, filter, sort, and pagination semantics

None. The export is unconditional and complete.

## Offline and sync model

The export is a pure read; it does not write to Dexie or enqueue outbox entries. The Dexie fallback makes the feature usable offline at the cost of staleness when there are pending outbox entries — the client envelope reflects local Dexie state, which is a superset of what's on the server until the outbox drains. Documented transparently via `source: 'client'` in the envelope.

When the server returns 200 and the client also has unflushed outbox entries, the client envelope (`source: 'client'`) would be the more complete dump. v1 always prefers `source: 'server'` when it succeeds — pragmatic, documented trade-off.

## Validation rules

- Server and client both Zod-validate each row before inclusion. Rows that fail are dropped; a string is appended to `_warnings` describing the entity, index, and Zod error message.
- Validation does not block the download; warnings are advisory.
- Empty exports (fresh install, no data anywhere) are valid: every array is `[]`, optional keys are omitted, `_warnings` is omitted.
- The envelope itself is validated on emit; if envelope construction fails (programmer error), the server returns 500 and the client toasts `Export failed`.

## Visual Design

No mockup. The footer item adopts existing nav typography and spacing tokens (Inter, dark-mode `#0B0B0C`/`#17181A`, 14px rounding, amber `#F59E0B` accent on hover/active per the rest of the app). Glyph: lucide `download` at the same size as adjacent nav glyphs. Hairline divider above (color `#26272A`).

## Existing Code to Leverage

- `specs/exercise-library/planning/spec.md` — shared error envelope and per-entity schema patterns reused across the export.
- Sibling specs (`routines`, `programs`, `workout-sessions`, `workout-history`, `goals`) — canonical Zod schemas for each entity included in the envelope.
- `src/shared/index.ts` — barrel re-exporting every entity schema; the registry imports from here.
- `src/server/routes/api.ts` — Hono scaffold; register `src/server/routes/export.ts` as a sibling of the per-entity routers.
- `src/client/db/forge-db.ts` — Dexie database; the fallback path reads each store directly via `db.<store>.toArray()`.
- `src/client/components/Sidebar.tsx` and `src/client/components/Drawer.tsx` (or equivalents) — extend with the footer entry; reuse existing nav-item primitives.
- `package.json` — `appVersion` source for the envelope.
- `docs/PRODUCT-PLAN.md` — sidebar/drawer footer placement guidance and the `WORKOUT_DASH_API_TOKEN` cleanup item.

## Out of Scope

- Import (reverse direction); selective / per-entity exports; compression; streaming; encryption.
- Bearer-token auth on `/api/v1/export`; per-user isolation; multi-user accounts.
- Scheduled / automated / pushed exports (cloud, S3, etc.).
- "Last exported at" indicators or any export-history UI.
- Schema-version migration tooling.
- Server-side filename templating beyond the fixed `forge-export-YYYY-MM-DD.json` shape.
- Filtering or pagination of the export.
