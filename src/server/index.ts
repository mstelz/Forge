import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { db, sqlite } from "../db/client";
import { api } from "./routes/api";
import { auth } from "./auth";

const PORT = Number(process.env.PORT ?? 8080);
const CLIENT_DIR = process.env.FORGE_CLIENT_DIR ?? "./dist/client";
const MIGRATIONS_DIR = process.env.FORGE_MIGRATIONS_DIR ?? "./src/db/migrations";

// Ensure the drizzle migrations table exists (idempotent — migrate() also does this).
sqlite.exec(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`);

// If a column was added outside of drizzle (manually or by a partial run that was
// later rolled back at the record level), record the migration so drizzle doesn't
// try to re-run it and crash with "duplicate column name".
function recordIfOrphaned(table: string, column: string, tag: string, when: number) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) return;
  const content = readFileSync(`${MIGRATIONS_DIR}/${tag}.sql`).toString();
  const hash = createHash("sha256").update(content).digest("hex");
  const exists = sqlite.prepare("SELECT 1 FROM __drizzle_migrations WHERE hash = ?").get(hash);
  if (!exists) {
    console.log(`[migrations] recording orphaned migration ${tag}`);
    sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run(hash, when);
  }
}

// Inverse of recordIfOrphaned: if a column was dropped outside of drizzle, record the
// migration so drizzle doesn't crash with "no such column" when it tries to DROP it.
function recordIfDropped(table: string, column: string, tag: string, when: number) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  const content = readFileSync(`${MIGRATIONS_DIR}/${tag}.sql`).toString();
  const hash = createHash("sha256").update(content).digest("hex");
  const exists = sqlite.prepare("SELECT 1 FROM __drizzle_migrations WHERE hash = ?").get(hash);
  if (!exists) {
    console.log(`[migrations] recording orphaned migration ${tag}`);
    sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run(hash, when);
  }
}

recordIfOrphaned("program_days", "overrides_json", "0006_program_day_overrides", 1779900000000);
recordIfOrphaned("program_runs", "week_zero_start_date", "0007_program_run_week_zero", 1779910000000);
recordIfOrphaned("program_days", "order", "0008_program_day_multi_workout", 1748390400000);
recordIfDropped("routine_items", "rpe_mode", "0009_remove_routine_rpe", 1748476800000);

migrate(db, { migrationsFolder: MIGRATIONS_DIR });
console.log("migrations applied");

const app = new Hono();

app.use("*", logger());
app.route("/api/v1", auth(api));

// Serve built SPA in production. In dev, Vite owns the client at :5173.
if (process.env.NODE_ENV === "production") {
  // Explicit favicon route ensures correct Content-Type regardless of proxy config.
  app.get("/favicon.svg", (c) => {
    const file = Bun.file(`${CLIENT_DIR}/favicon.svg`);
    return new Response(file, { headers: { "Content-Type": "image/svg+xml" } });
  });

  app.use("/*", serveStatic({ root: CLIENT_DIR }));
  app.get("*", (c) => {
    const file = Bun.file(`${CLIENT_DIR}/index.html`);
    return new Response(file, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  });
}

export default {
  port: PORT,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};

console.log(`Forge server listening on :${PORT}`);
