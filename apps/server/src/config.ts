import { MAX_UPLOAD_BYTES } from "@screenshot/shared";

const env = Bun.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  appOrigin: env.PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
  assetOrigin: env.PUBLIC_ASSET_ORIGIN ?? "http://localhost:3000",
  dataDir: env.DATA_DIR ?? "./data",
  maxUploadBytes: Number(env.MAX_UPLOAD_BYTES ?? MAX_UPLOAD_BYTES),
  idLength: Number(env.ID_LENGTH ?? 12)
};

export function isAssetHost(host: string | null | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(config.assetOrigin).host === host;
  } catch {
    return false;
  }
}
