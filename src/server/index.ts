import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from "../db/client";
import { api } from "./routes/api";
import { auth } from "./auth";

const PORT = Number(process.env.PORT ?? 8080);
const CLIENT_DIR = process.env.FORGE_CLIENT_DIR ?? "./dist/client";
const MIGRATIONS_DIR = process.env.FORGE_MIGRATIONS_DIR ?? "./src/db/migrations";

migrate(db, { migrationsFolder: MIGRATIONS_DIR });
console.log("migrations applied");

const app = new Hono();

app.use("*", logger());
app.route("/api/v1", auth(api));

// Serve built SPA in production. In dev, Vite owns the client at :5173.
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: CLIENT_DIR }));
  app.get("*", serveStatic({ path: `${CLIENT_DIR}/index.html` }));
}

export default {
  port: PORT,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};

console.log(`Forge server listening on :${PORT}`);
