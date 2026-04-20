import { DEFAULT_UPLOAD_LIMIT_MB } from "@screenshot/shared";

const env = Bun.env;

export const config = {
  port: Number(env.PORT ?? 3005),
  appOrigin: env.PUBLIC_APP_ORIGIN ?? "http://localhost:3005",
  assetOrigin: env.PUBLIC_ASSET_ORIGIN ?? "http://localhost:3005",
  dataDir: env.DATA_DIR ?? "./data",
  defaultUploadLimitMb: Number(env.MAX_UPLOAD_MB ?? DEFAULT_UPLOAD_LIMIT_MB),
  idLength: Number(env.ID_LENGTH ?? 12),
  adminDashboardEnabled: env.ADMIN_DASHBOARD_ENABLED !== "false",
  uploadAuthRequired: env.UPLOAD_AUTH_REQUIRED === "true",
  assetsAuthRequired: env.ASSETS_AUTH_REQUIRED === "true",
  imageCompressionEnabled: env.IMAGE_COMPRESSION_ENABLED !== "false",
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
