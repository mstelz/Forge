# Forge

Self-hosted workout tracker. See `docs/PRD.md`.

## Stack

Bun · Hono · SQLite (Drizzle) · Vite · React · Tailwind v4 · Dexie (offline) · PWA.
Full rationale in [docs/decisions/0004-tech-stack.md](docs/decisions/0004-tech-stack.md).

## Dev

```bash
bun install
mkdir -p data
bun run db:generate        # when schema changes
bun run db:migrate         # apply migrations
bun run dev                # server on :8080, vite on :5173
```

Visit `http://localhost:5173`.

## Build & run

```bash
bun run build
bun run start              # serves SPA + API from :8080
```

## Docker

```bash
docker build -t forge:latest .
docker run -v forge-data:/data -p 8080:8080 -e FORGE_TOKEN=secret forge:latest
```

## Layout

```
src/
  client/       React app (Vite root)
  server/       Hono server
  db/           Drizzle schema + migrations
  shared/       Types shared across client & server
docs/
  PRD.md
  SETTINGS-PLAN.md
  decisions/    Architectural / product decisions
design/         Stitch-generated mockups (visual reference)
```
