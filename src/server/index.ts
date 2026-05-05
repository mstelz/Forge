import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { api } from "./routes/api";
import { auth } from "./auth";

const PORT = Number(process.env.PORT ?? 8080);
const CLIENT_DIR = process.env.FORGE_CLIENT_DIR ?? "./dist/client";

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
  fetch: app.fetch,
};

console.log(`Forge server listening on :${PORT}`);
