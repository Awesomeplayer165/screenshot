import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { UploadStatus } from "@screenshot/shared";
import { config } from "../config";

export type UploadRecord = {
  id: string;
  status: UploadStatus;
  mimeType: string | null;
  extension: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  publicUrl: string | null;
  createdAt: string;
  completedAt: string | null;
  sha256: string | null;
};

const dbPath = join(config.dataDir, "metadata.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'complete', 'failed')),
    mime_type TEXT,
    extension TEXT,
    size_bytes INTEGER,
    storage_path TEXT,
    public_url TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at TEXT,
    sha256 TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at);
  CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
`);

const insertReserved = db.query(`
  INSERT INTO uploads (id, status, public_url)
  VALUES (?, 'reserved', ?)
`);

const selectById = db.query<UploadRecord, [string]>(`
  SELECT
    id,
    status,
    mime_type AS mimeType,
    extension,
    size_bytes AS sizeBytes,
    storage_path AS storagePath,
    public_url AS publicUrl,
    created_at AS createdAt,
    completed_at AS completedAt,
    sha256
  FROM uploads
  WHERE id = ?
`);

const completeUpload = db.query(`
  UPDATE uploads
  SET
    status = 'complete',
    mime_type = ?,
    extension = ?,
    size_bytes = ?,
    storage_path = ?,
    completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    sha256 = ?
  WHERE id = ? AND status = 'reserved'
`);

const failUpload = db.query(`
  UPDATE uploads
  SET status = 'failed'
  WHERE id = ? AND status = 'reserved'
`);

export function createReservedUpload(id: string, publicUrl: string): void {
  insertReserved.run(id, publicUrl);
}

export function findUpload(id: string): UploadRecord | null {
  return selectById.get(id) ?? null;
}

export function markUploadComplete(input: {
  id: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  storagePath: string;
  sha256: string;
}): boolean {
  const result = completeUpload.run(
    input.mimeType,
    input.extension,
    input.sizeBytes,
    input.storagePath,
    input.sha256,
    input.id
  );
  return result.changes === 1;
}

export function markUploadFailed(id: string): void {
  failUpload.run(id);
}
