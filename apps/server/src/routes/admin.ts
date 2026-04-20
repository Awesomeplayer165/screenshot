import { Hono } from "hono";
import type { AdminSummary, AppSettings } from "@screenshot/shared";
import { deleteUpload, findUpload, getAdminStats, listUploads } from "../services/db";
import { requireUser } from "../services/auth";
import { runManualCleanup } from "../services/cleanup";
import { getSettings, updateSettings } from "../services/settings";
import { deleteStoredAsset } from "../services/storage";

export const admin = new Hono();

admin.use("*", requireUser);

admin.get("/summary", (c) => {
  const uploads = listUploads(250);
  const stats = getAdminStats();
  const body: AdminSummary = {
    settings: getSettings(),
    uploads,
    storageBytes: stats.storageBytes,
    stats
  };

  return c.json(body);
});

admin.post("/prune", async (c) => {
  return c.json(await runManualCleanup());
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
