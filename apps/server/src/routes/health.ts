import { Hono } from "hono";

export const health = new Hono();

health.get("/healthz", (c) => {
  return c.json({ ok: true });
});
