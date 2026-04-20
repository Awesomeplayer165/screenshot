import { createHash } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config";

export type StoredUpload = {
  path: string;
  sizeBytes: number;
  sha256: string;
};

const assetsDir = join(config.dataDir, "assets");
const tmpDir = join(config.dataDir, "tmp");

export async function ensureStorage(): Promise<void> {
  await mkdir(assetsDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });
}

export function pathForAsset(id: string, extension: string): string {
  return join(assetsDir, id.slice(0, 2), id.slice(2, 4), `${id}.${extension}`);
}

export async function storeUpload(id: string, extension: string, bytes: Uint8Array): Promise<StoredUpload> {
  await ensureStorage();

  const finalPath = pathForAsset(id, extension);
  const tempPath = join(tmpDir, `${id}.${extension}.uploading`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  await mkdir(join(assetsDir, id.slice(0, 2), id.slice(2, 4)), { recursive: true });
  await writeFile(tempPath, bytes, { flag: "wx" });
  await rename(tempPath, finalPath);

  return {
    path: finalPath,
    sizeBytes: bytes.byteLength,
    sha256
  };
}

export async function removeTemp(id: string, extension: string): Promise<void> {
  try {
    await unlink(join(tmpDir, `${id}.${extension}.uploading`));
  } catch {
    // Best effort cleanup only.
  }
}
