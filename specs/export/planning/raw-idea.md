# Raw Idea: Export & API Surface

This slice closes two PRD obligations that no prior spec fully owns:

1. **Single-file JSON export of all user-owned data** (PRD §API and automation: "Export all user-owned data"). The user can download a single JSON file containing every entity the app stores: exercises, equipment, routines, programs (`programs` + `program_days` + `program_runs` + `program_run_day_states`), workout sessions (`sessions` + `session_set_logs`), goals, and the user's `settings` if/when that table lands. The export is a one-shot dump, not a streaming or incremental backup, and lives behind a "Export JSON" affordance — desktop: sidebar footer; mobile: drawer footer (per `docs/PRODUCT-PLAN.md` §General rule).

2. **Confirm the `/api/v1` surface is complete and consistent across slices** (PRD §API and automation: "CRUD exercises, goals, routines, and programs via `/api/v1`"). Each sibling spec already specs its own CRUD; this slice does not redefine those endpoints — it documents the union, the shared error envelope, and the shared `pending_writes` outbox dispatch contract, so that any new entity added in the future has a single specification to mirror.

3. **Public-docs hygiene**: remove "writes respect `WORKOUT_DASH_API_TOKEN` when configured" from any public-facing API docs (per `docs/PRODUCT-PLAN.md` line 239). v1 deliberately ships without auth (single-user, local); the bearer-token PRD requirement is documented as deferred across every slice and must not be advertised as a partial implementation.

Stack: a small Hono `GET /api/v1/export` endpoint that produces the JSON dump, a tiny client helper that triggers the download (uses the local Dexie cache offline; falls back to the server endpoint when online for a fresh-from-source dump), and a single drawer/sidebar footer entry. No new tables, no new outbox entities, no new mutations.

Visual references: none yet (no design mockup; the affordance is a single nav-drawer / sidebar footer link). UX is text-only.

Key open questions the spec-researcher should resolve (do NOT answer them — just record them as open questions):

- Export source: client-side dump from Dexie (works offline, may lag the server) vs. server-side dump from SQLite (authoritative, requires connectivity). Pick one as default; the other can be a fallback.
- File shape: single top-level object keyed by entity name (`{ exercises: [...], equipment: [...], routines: [...], ... }`) vs. a versioned envelope (`{ schemaVersion: 1, exportedAt: 1234, entities: { ... } }`). Pick a stable shape and version it from day one to avoid breaking external scripts.
- Filename convention: `forge-export-YYYY-MM-DD.json` vs. `forge-export-<unix-ms>.json`. Pick one.
- Compression / size: do we gzip large exports, or always emit plain JSON? Sane upper bound for v1 (likely no compression; users won't have multi-MB datasets in v1).
- Reverse direction (import): out of scope for v1 per PRD's silence on it; mention explicitly so the next slice doesn't get tempted.
- Pretty-print: emit pretty-printed JSON (more useful for casual users) vs. minified (smaller). Pretty-printed by default in v1.
- API parity vs. extension: the export endpoint is a v1 convenience, not a substitute for the per-entity `GET` endpoints. Document that it is read-only and may move under `/api/v1/admin/export` if/when auth lands.
- Entity coverage rule: hardcoded list vs. registry-driven. Hardcoded is simpler in v1; document the registration contract for future entities so the next maintainer adds one line per new table.
- Bearer-token doc cleanup: where in the codebase / docs is the `WORKOUT_DASH_API_TOKEN` reference still leaking? Catalog as a one-time docs-cleanup task.

Deliverable for this step: just the folder + raw-idea file. The next agent (spec-researcher) will lock decisions and produce `requirements.md`.
