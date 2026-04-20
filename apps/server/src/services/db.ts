import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AppSettings, UploadStatus } from "@screenshot/shared";
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
  originalSizeBytes: number | null;
};

const dbPath = join(config.dataDir, "metadata.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);

runMigrations();

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
    original_size_bytes AS originalSizeBytes,
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
    original_size_bytes = ?,
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

const listUploadsQuery = db.query<UploadRecord, [number]>(`
  SELECT
    id,
    status,
    mime_type AS mimeType,
    extension,
    size_bytes AS sizeBytes,
    original_size_bytes AS originalSizeBytes,
    storage_path AS storagePath,
    public_url AS publicUrl,
    created_at AS createdAt,
    completed_at AS completedAt,
    sha256
  FROM uploads
  ORDER BY created_at DESC
  LIMIT ?
`);

const listCompletedUploadsForCleanupQuery = db.query<UploadRecord, []>(`
  SELECT
    id,
    status,
    mime_type AS mimeType,
    extension,
    size_bytes AS sizeBytes,
    original_size_bytes AS originalSizeBytes,
    storage_path AS storagePath,
    public_url AS publicUrl,
    created_at AS createdAt,
    completed_at AS completedAt,
    sha256
  FROM uploads
  WHERE status = 'complete'
  ORDER BY COALESCE(completed_at, created_at) ASC
`);

const deleteUploadQuery = db.query(`DELETE FROM uploads WHERE id = ?`);
const getSettingQuery = db.query<{ value: string }, [string]>(`SELECT value FROM settings WHERE key = ?`);
const setSettingQuery = db.query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
const deleteSessionQuery = db.query(`DELETE FROM sessions WHERE id = ?`);
const insertSessionQuery = db.query(`INSERT INTO sessions (id, email, expires_at) VALUES (?, ?, ?)`);
const getSessionQuery = db.query<{ id: string; email: string; expiresAt: string }, [string]>(`
  SELECT id, email, expires_at AS expiresAt
  FROM sessions
  WHERE id = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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
  originalSizeBytes: number;
  storagePath: string;
  sha256: string;
}): boolean {
  const result = completeUpload.run(
    input.mimeType,
    input.extension,
    input.sizeBytes,
    input.originalSizeBytes,
    input.storagePath,
    input.sha256,
    input.id
  );
  return result.changes === 1;
}

export function markUploadFailed(id: string): void {
  failUpload.run(id);
}

export function listUploads(limit = 100): UploadRecord[] {
  return listUploadsQuery.all(limit);
}

export function deleteUpload(id: string): boolean {
  return deleteUploadQuery.run(id).changes === 1;
}

export function getSetting(key: keyof AppSettings): string | null {
  return getSettingQuery.get(key)?.value ?? null;
}

export function setSetting(key: keyof AppSettings, value: string): void {
  setSettingQuery.run(key, value);
}

export function createSession(id: string, email: string, expiresAt: string): void {
  insertSessionQuery.run(id, email, expiresAt);
}

export function findSession(id: string): { id: string; email: string; expiresAt: string } | null {
  return getSessionQuery.get(id) ?? null;
}

export function deleteSession(id: string): void {
  deleteSessionQuery.run(id);
}

export function listCompletedUploadsForCleanup(): UploadRecord[] {
  return listCompletedUploadsForCleanupQuery.all();
}

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const appliedQuery = db.query<{ id: string }, [string]>(`SELECT id FROM schema_migrations WHERE id = ?`);
  const markApplied = db.query(`INSERT INTO schema_migrations (id) VALUES (?)`);

  const migrations: Array<{ id: string; run: () => void }> = [
    {
      id: "001_initial_schema",
      run: () => {
        db.exec(`
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

          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY NOT NULL,
            email TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            expires_at TEXT NOT NULL
          );
        `);
      }
    },
    {
      id: "002_upload_original_size",
      run: () => {
        addColumnIfMissing("uploads", "original_size_bytes", "INTEGER");
      }
    }
  ];

  for (const migration of migrations) {
    if (appliedQuery.get(migration.id)) continue;
    db.transaction(() => {
      migration.run();
      markApplied.run(migration.id);
    })();
  }
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map((entry) => entry.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
