# 0004 — Tech stack

**Status:** accepted · **Date:** 2026-04-23

## Context

Forge is self-hosted, single-user in v1, must run offline, and should ship as one container. We want to minimize operational surface, keep the runtime boring, and pick libraries that will still be maintained in three years.

## Decision

Bun runtime running a Hono server that serves both `/api/v1` and the built SPA. Vite + React + TypeScript on the client. SQLite (via `bun:sqlite` + Drizzle) as the server store. Dexie (IndexedDB) as the on-device store for offline-first logging.

## Full stack

| Concern | Choice |
|---|---|
| Runtime | **Bun** (1.3+) |
| Server framework | **Hono** |
| Database | **SQLite** via `bun:sqlite` |
| ORM / queries | **Drizzle ORM** + `drizzle-kit` for migrations |
| Bundler / dev server | **Vite** |
| UI framework | **React 19** + TypeScript |
| Styling | **Tailwind v4** + CSS variables for themes |
| Component primitives | **Radix UI** (headless, we style) |
| Server state | **TanStack Query** |
| Client data store (offline) | **Dexie** (IndexedDB) |
| Validation | **Zod** (shared client/server) |
| Dates | **Temporal** via `temporal-polyfill` |
| Drag & drop | **@dnd-kit** |
| PWA | **vite-plugin-pwa** + Workbox |
| Unit tests | **Vitest** |
| E2E | **Playwright** (critical path only) |
| Container | single **Dockerfile**, multi-stage Bun build |

## Rationale

- **Bun** pairs natively with Hono, has built-in SQLite, bundles Vite workflows well; single-user perf doesn't need it but DX is good
- **Hono** is tiny, fast, familiar Express-like API, trivial to serve SPA + API from same process
- **SQLite** is ideal for a one-container self-hosted app — one file, one volume, no service dependency
- **Drizzle** gives us typed queries without Prisma's heavy runtime and generated client
- **Dexie** makes offline explicit — we own the sync/outbox logic rather than fighting an opinionated sync library (RxDB)
- **Temporal** is genuinely better than date-fns for timezone-aware work (Today boundaries, week-start) called out in SETTINGS-PLAN
- **Tailwind v4 + CSS variables** gives utility speed without coupling dark/light to Tailwind's `dark:` class — themes swap via `data-theme` attribute

## Rejected alternatives

- **Node + better-sqlite3** — equally valid; picked Bun for DX and single-runtime simplicity
- **SvelteKit** — smaller runtime, nicer DX, but React has stronger offline/sync library ecosystem
- **RxDB** — more batteries-included than Dexie, but opinionated; we prefer explicit sync
- **date-fns** — fine for simple dates but Temporal handles timezones and durations natively
- **Prisma** — heavier, generated client complicates edge deploy stories

## Consequences

- Single-binary-ish deploy: `bun install && bun run build && bun src/server/index.ts`
- Bun debugger maturity in VS Code is slightly behind Node's — acceptable tradeoff
- Temporal polyfill adds ~30kb gzipped — worth it for correctness
- Need to own the offline sync layer (outbox table in Dexie, flushed to API when online)
