import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AdminStats, AppSettings, UploadStatus } from "@screenshot/shared";
import { config } from "../config";

export type UploadRecord = {
  id: string;
  status: UploadStatus;
  mimeType: string | null;
  extension: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  publicUrl: string | null;
  downloadCount: number;
  bytesServed: number;
  lastAccessedAt: string | null;
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
    download_count AS downloadCount,
    bytes_served AS bytesServed,
    last_accessed_at AS lastAccessedAt,
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
    download_count AS downloadCount,
    bytes_served AS bytesServed,
    last_accessed_at AS lastAccessedAt,
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
    download_count AS downloadCount,
    bytes_served AS bytesServed,
    last_accessed_at AS lastAccessedAt,
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
const recordAssetDownloadQuery = db.query(`
  UPDATE uploads
  SET
    download_count = download_count + 1,
    bytes_served = bytes_served + ?,
    last_accessed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = ? AND status = 'complete'
`);
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

export function recordAssetDownload(id: string, bytesServed: number): void {
  recordAssetDownloadQuery.run(bytesServed, id);
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

export function getAdminStats(): AdminStats {
  const rows = db
    .query<{
      id: string;
      status: UploadStatus;
      mimeType: string | null;
      sizeBytes: number | null;
      originalSizeBytes: number | null;
      downloadCount: number;
      bytesServed: number;
      publicUrl: string | null;
      createdAt: string;
      completedAt: string | null;
    }, []>(`
      SELECT
        id,
        status,
        mime_type AS mimeType,
        size_bytes AS sizeBytes,
        original_size_bytes AS originalSizeBytes,
        download_count AS downloadCount,
        bytes_served AS bytesServed,
        public_url AS publicUrl,
        created_at AS createdAt,
        completed_at AS completedAt
      FROM uploads
    `)
    .all();

  let completedUploads = 0;
  let failedUploads = 0;
  let reservedUploads = 0;
  let storageBytes = 0;
  let originalBytes = 0;
  let dataOutBytes = 0;
  let downloadCount = 0;
  const fileTypeMap = new Map<string, { label: string; count: number; bytes: number }>();
  const dayMap = new Map<string, { date: string; uploads: number; bytes: number; downloads: number; bytesServed: number }>();

  for (const row of rows) {
    if (row.status === "complete") completedUploads += 1;
    if (row.status === "failed") failedUploads += 1;
    if (row.status === "reserved") reservedUploads += 1;

    const sizeBytes = row.sizeBytes ?? 0;
    const originalSizeBytes = row.originalSizeBytes ?? sizeBytes;
    storageBytes += sizeBytes;
    originalBytes += originalSizeBytes;
    dataOutBytes += row.bytesServed;
    downloadCount += row.downloadCount;

    const type = row.mimeType ?? "reserved";
    const typeEntry = fileTypeMap.get(type) ?? { label: type, count: 0, bytes: 0 };
    typeEntry.count += 1;
    typeEntry.bytes += sizeBytes;
    fileTypeMap.set(type, typeEntry);

    const date = (row.completedAt ?? row.createdAt).slice(0, 10);
    const dayEntry = dayMap.get(date) ?? { date, uploads: 0, bytes: 0, downloads: 0, bytesServed: 0 };
    dayEntry.uploads += row.status === "complete" ? 1 : 0;
    dayEntry.bytes += sizeBytes;
    dayEntry.downloads += row.downloadCount;
    dayEntry.bytesServed += row.bytesServed;
    dayMap.set(date, dayEntry);
  }

  const topDownloads = rows
    .filter((row) => row.downloadCount > 0)
    .sort((a, b) => b.downloadCount - a.downloadCount || b.bytesServed - a.bytesServed)
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      publicUrl: row.publicUrl,
      downloadCount: row.downloadCount,
      bytesServed: row.bytesServed
    }));

  return {
    totalUploads: rows.length,
    completedUploads,
    failedUploads,
    reservedUploads,
    storageBytes,
    originalBytes,
    savedBytes: Math.max(0, originalBytes - storageBytes),
    dataOutBytes,
    downloadCount,
    averageStoredBytes: completedUploads ? Math.round(storageBytes / completedUploads) : 0,
    uploadToDownloadRatio: storageBytes > 0 ? dataOutBytes / storageBytes : 0,
    fileTypes: Array.from(fileTypeMap.values()).sort((a, b) => b.bytes - a.bytes),
    topDownloads,
    recentDays: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-14)
  };
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
            original_size_bytes INTEGER,
            download_count INTEGER NOT NULL DEFAULT 0,
            bytes_served INTEGER NOT NULL DEFAULT 0,
            last_accessed_at TEXT,
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
    },
    {
      id: "003_download_stats",
      run: () => {
        addColumnIfMissing("uploads", "download_count", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfMissing("uploads", "bytes_served", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfMissing("uploads", "last_accessed_at", "TEXT");
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_uploads_download_count ON uploads(download_count);
          CREATE INDEX IF NOT EXISTS idx_uploads_last_accessed_at ON uploads(last_accessed_at);
        `);
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
