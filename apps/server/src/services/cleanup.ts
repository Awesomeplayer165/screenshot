import type { AppSettings } from "@screenshot/shared";
import { deleteUpload, listCompletedUploadsForCleanup, type UploadRecord } from "./db";
import { getSettings } from "./settings";
import { deleteStoredAsset } from "./storage";

const cleanupIntervalMs = 60 * 60 * 1000;
let lastCleanupAt = 0;
let cleanupRunning = false;

export async function maybeRunCleanup(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastCleanupAt < cleanupIntervalMs) return;
  if (cleanupRunning) return;

  cleanupRunning = true;
  lastCleanupAt = now;

  try {
    await runCleanup(getSettings());
  } finally {
    cleanupRunning = false;
  }
}

async function runCleanup(settings: AppSettings): Promise<void> {
  if (settings.pruneDays <= 0 && settings.pruneGb <= 0) return;

  const uploads = listCompletedUploadsForCleanup();
  const toDelete = new Map<string, UploadRecord>();

  if (settings.pruneDays > 0) {
    const cutoff = Date.now() - settings.pruneDays * 24 * 60 * 60 * 1000;
    for (const upload of uploads) {
      if (Date.parse(upload.completedAt ?? upload.createdAt) < cutoff) {
        toDelete.set(upload.id, upload);
      }
    }
  }

  if (settings.pruneGb > 0) {
    const maxBytes = settings.pruneGb * 1024 * 1024 * 1024;
    let totalBytes = uploads.reduce((total, upload) => total + (upload.sizeBytes ?? 0), 0);
    for (const upload of toDelete.values()) {
      totalBytes -= upload.sizeBytes ?? 0;
    }

    for (const upload of uploads) {
      if (totalBytes <= maxBytes) break;
      if (toDelete.has(upload.id)) continue;
      if (!toDelete.has(upload.id)) toDelete.set(upload.id, upload);
      totalBytes -= upload.sizeBytes ?? 0;
    }
  }

  for (const upload of toDelete.values()) {
    await deleteStoredAsset(upload.storagePath);
    deleteUpload(upload.id);
  }
}
