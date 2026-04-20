import { DEFAULT_UPLOAD_LIMIT_MB } from "@screenshot/shared";

const env = Bun.env;

export const config = {
  port: Number(env.PORT ?? 3005),
  appOrigin: env.PUBLIC_APP_ORIGIN ?? "http://localhost:3005",
  assetOrigin: env.PUBLIC_ASSET_ORIGIN ?? "http://localhost:3005",
  dataDir: env.DATA_DIR ?? "./data",
  defaultUploadLimitMb: DEFAULT_UPLOAD_LIMIT_MB,
  idLength: Number(env.ID_LENGTH ?? 12),
  adminDashboardEnabled: true,
  uploadAuthRequired: false,
  assetsAuthRequired: false,
  imageCompressionEnabled: true,
  imageCompressionLevel: "low",
  pruneDays: 0,
  pruneGb: 0,
  oidcIssuerUrl: env.OIDC_ISSUER_URL ?? "",
  oidcClientId: env.OIDC_CLIENT_ID ?? "",
  oidcClientSecret: env.OIDC_CLIENT_SECRET ?? "",
  oidcRedirectUri: env.OIDC_REDIRECT_URI ?? `${env.PUBLIC_APP_ORIGIN ?? "http://localhost:3005"}/auth/callback`,
  adminEmail: env.ADMIN_EMAIL ?? "",
  sessionSecret: env.SESSION_SECRET ?? "",
  cookieDomain: env.COOKIE_DOMAIN ?? ""
};

export function isAssetHost(host: string | null | undefined): boolean {
  if (!host) return false;
  try {
    const assetHost = new URL(config.assetOrigin).host;
    const appHost = new URL(config.appOrigin).host;
    return assetHost !== appHost && assetHost === host;
  } catch {
    return false;
  }
}
