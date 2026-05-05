# Spec Requirements: Export & API Surface

## Overview

This slice closes two PRD obligations: a **single-file JSON export of all user-owned data** (PRD §API and automation) and a **consolidation pass over the `/api/v1` surface** so the union of every per-slice CRUD set is documented and consistent. It also deletes a leaky public-docs reference to `WORKOUT_DASH_API_TOKEN` (per `docs/PRODUCT-PLAN.md` line 239) — v1 is single-user, local, and explicitly auth-free; the bearer-token requirement is deferred across every slice and must not be advertised as partially implemented.

The export ships behind a single nav affordance (`Export JSON`): desktop sidebar footer, mobile drawer footer (per PRODUCT-PLAN §General rule and §line 42–45). It produces a versioned JSON object containing every user-owned table; the file downloads to the user's device. There is no UI surface beyond the trigger.

## Goals

- One-click download of a versioned, schema-tagged JSON dump containing every user-owned entity (exercises, equipment, routines, programs + days + runs + run day states, sessions + session_set_logs, goals, settings if/when the table lands).
- Stable, versioned envelope shape (`{ schemaVersion, exportedAt, source, entities }`) so external scripts have a contract from day one.
- Default to a **server-side** dump (authoritative, single transaction over SQLite) when online; fall back to a **client-side Dexie** dump when offline (best-effort, may lag).
- Document the union of `/api/v1` CRUD endpoints already specced across exercise-library, routines, programs, workout-sessions, workout-history, and goals, and the shared error envelope used by every router.
- Remove every public-facing reference to `WORKOUT_DASH_API_TOKEN` in this repo's docs and ensure no spec advertises it as wired up.

## Non-goals (v1)

- **Import** (the reverse direction): not specced in v1; out of scope for both the endpoint and the UI.
- Selective / partial / per-entity exports (always all-or-nothing in v1).
- Compression (gzip, deflate, etc.) — emit plain pretty-printed JSON; users will not have multi-MB datasets in v1.
- Streaming exports / chunked downloads / pagination.
- Bearer-token auth on `/api/v1/export` (consistent deferral with sibling slices). The endpoint is open in v1; if/when auth lands, it relocates to `/api/v1/admin/export`.
- Per-user isolation; the export reflects the single-user deployment.
- Scheduled / automated exports, cloud sync, S3 push, etc.
- Schema-version migration: v1 emits `schemaVersion: 1`; future migrations are deferred.
- Encryption of the exported file at rest.
- Settings export beyond what's already in the `settings` table at export time (whatever shape settings spec lands with).

## User stories

- As the single user, I open the nav drawer (mobile) or sidebar (desktop) → tap **Export JSON** → my browser downloads `forge-export-YYYY-MM-DD.json` containing every record I own. No confirmation dialog (one-tap; deliberate per PRODUCT-PLAN density).
- As the user, when I'm offline I still see **Export JSON** working — it falls back to the local Dexie dump (with a small "exported from local cache" line in the JSON envelope so I can tell).
- As an external script, I `curl http://localhost:8080/api/v1/export` and receive the same envelope shape; I can parse `schemaVersion` to gate compatibility.
- As a maintainer adding a new entity, I add one entry to a single `EXPORT_REGISTRY` and the new table flows into both server and client exports without further plumbing.
- As a documentation reader, I find the union of `/api/v1` endpoints and the shared error envelope in one place (this spec's "API surface" section), not scattered across six sibling specs.

## Data model

No new tables, no new Dexie stores, no new outbox entities, no migrations.

### Export envelope (versioned)

```ts
type ExportEnvelope = {
  schemaVersion: 1;            // bumps on incompatible shape changes
  exportedAt: number;           // unix ms
  source: 'server' | 'client';  // 'server' = SQLite snapshot; 'client' = Dexie snapshot
  appVersion: string;           // package.json version at export time, for support
  entities: ExportEntities;
};

type ExportEntities = {
  exercises: Exercise[];
  equipment: Equipment[];
  routines: Routine[];
  routineExercises?: RoutineExercise[];     // if normalized in routines spec; otherwise undefined
  programs: Program[];
  programDays: ProgramDay[];
  programRuns: ProgramRun[];
  programRunDayStates: ProgramRunDayState[];
  sessions: Session[];
  sessionSetLogs: SessionSetLog[];
  goals: Goal[];
  settings?: Settings;           // emitted only if the settings table exists at export time
};
```

- All entity arrays use the canonical Zod-validated shape exported by the entity's slice (`src/shared/...`). No transformation, no field stripping.
- Source-specific footer: `source: 'server'` for the `/api/v1/export` path; `source: 'client'` when the trigger falls back to a Dexie dump.
- `appVersion` reads from `package.json` at boot; emitted to help future support / migration.
- `pending_writes` is **not** included; it is in-flight outbox state, not user-owned data.

### Export registry

A single typed list defines the entity ↔ table mapping:

```ts
// src/shared/export/registry.ts
export type ExportEntityKey =
  | 'exercises' | 'equipment'
  | 'routines' | 'routineExercises'
  | 'programs' | 'programDays' | 'programRuns' | 'programRunDayStates'
  | 'sessions' | 'sessionSetLogs'
  | 'goals' | 'settings';

export const EXPORT_REGISTRY: ExportEntitySpec[] = [
  { key: 'exercises', drizzleTable: exercises, dexieStore: 'exercises' },
  { key: 'equipment', drizzleTable: equipment, dexieStore: 'equipment' },
  // ... one entry per table; future entities add one line here
];
```

Server and client exporters iterate the registry in declared order; this is the single source of truth for "what's in the export".

## API surface

### New endpoint

`GET /api/v1/export` — returns the full `ExportEnvelope` as `application/json`. Sets `Content-Disposition: attachment; filename="forge-export-YYYY-MM-DD.json"` so a direct browser hit triggers a download. No query parameters in v1. Read-only.

- Server reads each registry table in a single SQLite read transaction so the snapshot is internally consistent.
- Response is pretty-printed (2-space indent) for human readability; v1 explicitly accepts the size cost.
- Errors: `500 { error: 'export_failed', detail: string }` on read failure (logged server-side). No partial exports; if any registry read fails, the whole request fails.
- Method allowlist: only `GET`; other verbs return `405`.

### Consolidated `/api/v1` surface (union of sibling specs)

This section is documentation, not new endpoints. It is the canonical reference for the project's HTTP surface.

| Resource | Endpoints | Owner spec |
|---|---|---|
| Exercises | `GET /exercises`, `GET/POST /exercises`, `GET/PATCH/DELETE /exercises/:id` | exercise-library |
| Equipment | `GET /equipment`, `GET/POST /equipment`, `GET/PATCH/DELETE /equipment/:id` | exercise-library |
| Routines | `GET /routines`, `POST /routines`, `GET/PATCH/DELETE /routines/:id` | routines |
| Programs | `GET /programs`, `POST /programs`, `GET/PATCH/DELETE /programs/:id` | programs |
| Program runs | `GET /program-runs`, `POST /program-runs`, `GET/PATCH/DELETE /program-runs/:id` | programs |
| Sessions | `GET /sessions`, `POST /sessions`, `GET/PATCH/DELETE /sessions/:id`, `POST/PATCH/DELETE /sessions/:id/logs/:logId` | workout-sessions |
| History (read-only) | `GET /history/sessions`, `GET /history/summary` | workout-history |
| Goals | `GET /goals`, `POST /goals`, `GET/PATCH/DELETE /goals/:id` | goals |
| Export | `GET /export` | this spec |

(The exact path strings above match each owner spec; refer to those specs for path-level detail. Discrepancies are bugs in the owner spec, not this one.)

### Shared error envelope

Every `/api/v1` route returns errors as `{ error: string, issues?: ZodIssue[], id?: string, currentUpdatedAt?: number }`. This shape is established by exercise-library and consumed by every sibling slice unchanged.

### Auth posture

- v1: **no auth gate** on any `/api/v1` route, including `/api/v1/export`. Single-user, local deployment.
- The `WORKOUT_DASH_API_TOKEN` env var has been **removed from public-facing docs** and is **not honored** in v1. If the variable still exists in code, it is a no-op and will be deleted as part of this slice's docs-cleanup task.
- When auth lands (post-v1), the export endpoint relocates to `/api/v1/admin/export` and is gated; the JSON shape stays the same.

## UI surface and behaviors

There is no dedicated page. The export is reachable from a single nav affordance.

### Trigger placement

- **Desktop sidebar:** an anchored footer item below the main nav, label `Export JSON`, with a small download glyph. Visually separated from the nav list by a hairline divider; sits at the bottom of the sidebar regardless of scroll position.
- **Mobile drawer:** the same item appears at the bottom of the slide-out drawer, below other nav items; styled identically to the desktop footer.

Both placements come directly from `docs/PRODUCT-PLAN.md` (lines 41–45, 70–72).

### Trigger behavior

1. User taps **Export JSON**.
2. Client checks online status:
   - **Online:** issue `GET /api/v1/export`. If the response is a 200, save the body as a download (`a.href = URL.createObjectURL(blob); a.download = filename; a.click()`). The server-emitted `Content-Disposition` filename is honored; the client computes a fallback filename (see Filename) if the header is absent.
   - **Offline (or server returns non-200):** fall back to the client-side Dexie dump path. Read every registry store, assemble the envelope with `source: 'client'`, pretty-print, and trigger the same download mechanism. No retry of the server path during the same tap.
3. No confirmation dialog. No progress indicator (export size is trivially small in v1 — registry reads are O(table size), all in IndexedDB or SQLite).
4. On unexpected failure: surface a toast `Export failed — try again` with the error message. No partial files written.

### Filename

- `forge-export-YYYY-MM-DD.json`, where the date is the local date at export time.
- Same format whether the export came from the server or client.
- The server sets `Content-Disposition: attachment; filename="forge-export-YYYY-MM-DD.json"` so direct browser hits get the same name.

### Empty / error states

- If the user has zero data in every entity (fresh install before the seed runs), the export still succeeds and emits an envelope with empty arrays.
- Server failure (500): client falls back to Dexie automatically (treated as "non-200"). User sees no error unless both paths fail.
- Both-paths-fail: toast as above; no file downloaded.

## Offline and sync model

The export is a read operation; it does not write to Dexie or enqueue outbox entries. The fallback path makes the feature useful offline at the cost of staleness when there are pending outbox entries — the client envelope reflects local Dexie state, which is a superset of what's on the server until the outbox drains. Document this transparently via `source: 'client'` in the envelope.

## Validation rules

- The export endpoint emits Zod-validated entity shapes; if any record fails schema parse during export, the server logs the offending entity and includes a `_warnings: string[]` array on the envelope (or fails the request — pick during implementation; default: log + include warning, do not fail).
- The client fallback path applies the same Zod validation; warnings flow into the same field.
- Schema validation does not block download; integrity warnings are advisory.

## Existing code to reference

- `specs/exercise-library/planning/spec.md` — establishes the shared error envelope and per-entity schema patterns reused by every entity in the export.
- `specs/workout-sessions/planning/spec.md`, `specs/programs/planning/spec.md`, `specs/routines/planning/spec.md`, `specs/workout-history/planning/spec.md`, `specs/goals/planning/spec.md` — provide the canonical Zod schemas for each table.
- `src/shared/index.ts` — barrel that already re-exports every entity schema; the registry imports from here.
- `src/server/routes/api.ts` — Hono scaffold; register `src/server/routes/export.ts` as a sibling of `exercises.ts`, `sessions.ts`, etc.
- `src/client/db/forge-db.ts` — Dexie database; the client fallback path reads each store via `db.exercises.toArray()`, etc.
- `docs/PRODUCT-PLAN.md` — sidebar/drawer footer placement guidance and the `WORKOUT_DASH_API_TOKEN` cleanup item.
- `docs/PRD.md` — §API and automation requirements that this spec closes.

## Visual assets

No new mockups. The trigger is a single text + glyph link in the sidebar/drawer footer. Existing components (sidebar, drawer) absorb the addition.

## Out of scope (explicit, v1)

- Import (reverse direction).
- Selective / per-entity exports.
- Compression, encryption, streaming, chunked downloads.
- Auth, rate limiting, audit logs on `/api/v1/export`.
- Scheduled / automated / push exports (cloud, S3, etc.).
- Schema migration tooling for older exports (no v0 to migrate from).
- Server-side filename templating (date format, custom names).
- Per-user isolation of exports (single-user deployment).
- A "last exported at" indicator anywhere in the UI.

## Open items and deferred concerns

- **Settings entity inclusion.** Whether `settings` is emitted depends on whether the settings spec lands a real table. v1 of this spec keys on existence: if the table exists, include it under `entities.settings`; if not, omit the key entirely. The client fallback reads the same way.
- **Schema-validation failure policy.** Default to log-and-warn (do not fail the request); revisit if real data triggers warnings frequently.
- **Source-of-truth tie-break.** When the server returns a 200 but the user has unflushed outbox entries, the client envelope (`source: 'client'`) would be the more complete dump. v1 always prefers `source: 'server'` when it succeeds; document the staleness trade-off.
- **Filename time-zone.** Local date at export time means two exports on the same UTC day from different time zones may carry different names. Acceptable in single-user v1.
- **Public-docs cleanup scope.** A grep pass over `docs/`, `README.md`, and `src/` will identify the residual `WORKOUT_DASH_API_TOKEN` references; the implementer deletes each unless it's load-bearing in code (in which case the variable becomes a no-op with a comment pointing to deferred auth work).
- **Registry granularity for routines.** If routines are stored as a single JSON-encoded blob on `routines` (rather than a normalized `routine_exercises` child table), the `routineExercises` registry entry is omitted. Implementer mirrors whatever shape the routines spec ships with.
