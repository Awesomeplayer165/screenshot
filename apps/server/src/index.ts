import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { config, isAssetHost } from "./config";
import { admin } from "./routes/admin";
import { assets } from "./routes/assets";
import { auth } from "./routes/auth";
import { health } from "./routes/health";
import { uploads } from "./routes/uploads";
import { getCurrentUser, loginUrlFor } from "./services/auth";
import { maybeRunCleanup } from "./services/cleanup";
import { getSettings } from "./services/settings";
import { ensureStorage } from "./services/storage";

await ensureStorage();
void maybeRunCleanup(true);

const app = new Hono();
const webDist = join(import.meta.dir, "../../web/dist");
const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp"
};

app.use(logger());

app.route("/", health);
app.route("/auth", auth);

app.use("*", async (c, next) => {
  if (isAssetHost(c.req.header("host"))) {
    if (getSettings().assetsAuthRequired && !getCurrentUser(c)) {
      return c.json({ error: "Authentication required" }, 401);
    }

    return assets.fetch(c.req.raw, c.env);
  }

  await next();
});

app.use("*", async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  const settings = getSettings();

  if (pathname.startsWith("/api/admin") && !settings.adminDashboardEnabled) {
    return c.json({ error: "Admin dashboard is disabled" }, 404);
  }

  if (
    settings.uploadAuthRequired &&
    !pathname.startsWith("/auth") &&
    !pathname.startsWith("/api/admin") &&
    pathname !== "/healthz" &&
    !getCurrentUser(c)
  ) {
    if (c.req.method === "GET" && !pathname.startsWith("/api/")) {
      return c.redirect(loginUrlFor(pathname, new URL(c.req.url).search));
    }

    return c.json({ error: "Authentication required" }, 401);
  }

  await next();
});

app.route("/api/uploads", uploads);
app.route("/api/admin", admin);
app.use("*", async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  if ((c.req.method === "GET" || c.req.method === "HEAD") && /^\/[0-9A-Za-z]{6,64}\.(png|jpe?g|webp)$/.test(pathname)) {
    return assets.fetch(c.req.raw, c.env);
  }

  await next();
});

if (existsSync(webDist)) {
  app.get("/assets/*", async (c) => {
    const pathname = new URL(c.req.url).pathname;
    const filePath = normalize(join(webDist, pathname));

    if (!filePath.startsWith(webDist) || !existsSync(filePath)) {
      return c.text("Not found", 404);
    }

    return new Response(Bun.file(filePath), {
      headers: {
        "Content-Type": mimeTypes[filePath.slice(filePath.lastIndexOf("."))] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  });

  app.get("*", () => {
    return new Response(Bun.file(join(webDist, "index.html")), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache"
      }
    });
  });
} else {
  app.get("/", (c) => c.text("Screenshot service is running. Build the web app to serve the UI."));
}

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

const server = Bun.serve({
  port: config.port,
  fetch: app.fetch
});

console.log(`Screenshot service listening on http://${server.hostname}:${server.port}`);
