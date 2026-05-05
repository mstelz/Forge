import type { Hono } from "hono";

/**
 * v1 auth: single shared bearer token via FORGE_TOKEN env var.
 * If unset, middleware no-ops (dev / trusted LAN).
 * See docs/decisions/0006-auth-deferred.md.
 */
export function auth<T extends Hono>(app: T): T {
  const token = process.env.FORGE_TOKEN;
  if (!token) return app;

  app.use("*", async (c, next) => {
    const header = c.req.header("Authorization");
    if (header !== `Bearer ${token}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return next();
  });
  return app;
}
