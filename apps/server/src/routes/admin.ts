import { Hono } from "hono";
import type { AdminSummary, AppSettings } from "@screenshot/shared";
import { deleteUpload, findUpload, listUploads } from "../services/db";
import { requireUser } from "../services/auth";
import { getSettings, updateSettings } from "../services/settings";
import { deleteStoredAsset } from "../services/storage";

export const admin = new Hono();

admin.use("*", requireUser);

admin.get("/summary", (c) => {
  const uploads = listUploads(250);
  const storageBytes = uploads.reduce((total, upload) => total + (upload.sizeBytes ?? 0), 0);
  const body: AdminSummary = {
    settings: getSettings(),
    uploads,
    storageBytes
  };

  return c.json(body);
});

admin.put("/settings", async (c) => {
  const payload = (await c.req.json()) as Partial<AppSettings>;
  return c.json({ settings: updateSettings(payload) });
});

admin.delete("/uploads/:id", async (c) => {
  const id = c.req.param("id");
  const upload = findUpload(id);
  if (!upload) return c.json({ error: "Upload not found" }, 404);

  await deleteStoredAsset(upload.storagePath);
  deleteUpload(id);

  return c.json({ ok: true });
});
