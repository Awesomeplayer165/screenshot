import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { Hono } from "hono";
import { type ApiErrorResponse } from "@screenshot/shared";
import { findUpload, recordAssetDownload } from "../services/db";

export const assets = new Hono();

assets.on(["GET", "HEAD"], "/:file", async (c) => {
  const file = c.req.param("file");
  const match = /^([0-9A-Za-z]{6,64})\.(png|jpe?g|webp)$/.exec(file);

  if (!match) {
    return c.json<ApiErrorResponse>({ error: "Asset not found" }, 404);
  }

  const id = match[1];
  if (!id) {
    return c.json<ApiErrorResponse>({ error: "Asset not found" }, 404);
  }
  const record = findUpload(id);

  if (!record || record.status !== "complete" || !record.storagePath || !record.mimeType) {
    return c.json<ApiErrorResponse>({ error: "Asset not found" }, 404);
  }

  if (!existsSync(record.storagePath)) {
    return c.json<ApiErrorResponse>({ error: "Asset not found" }, 404);
  }

  const fileStat = await stat(record.storagePath);
  const headers = new Headers({
    "Content-Type": record.mimeType,
    "Content-Length": String(fileStat.size),
    "Content-Disposition": "inline",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff"
  });

  if (c.req.method === "HEAD") {
    return new Response(null, { headers });
  }

  recordAssetDownload(id, fileStat.size);
  return new Response(Bun.file(record.storagePath), { headers });
});
