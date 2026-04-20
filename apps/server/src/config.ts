import { DEFAULT_UPLOAD_LIMIT_MB } from "@screenshot/shared";

const env = Bun.env;
const value = (input: string | undefined, fallback = "") => {
  const cleaned = input?.trim();
  return cleaned ? cleaned : fallback;
};

const appOrigin = value(env.PUBLIC_APP_ORIGIN, "http://localhost:3005");
const assetOrigin = value(env.PUBLIC_ASSET_ORIGIN, "http://localhost:3005");
const cookieDomain = normalizeCookieDomain(value(env.COOKIE_DOMAIN));

export const config = {
  port: Number(env.PORT ?? 3005),
  appOrigin,
  assetOrigin,
  dataDir: value(env.DATA_DIR, "./data"),
  defaultUploadLimitMb: DEFAULT_UPLOAD_LIMIT_MB,
  idLength: Number(env.ID_LENGTH ?? 12),
  adminDashboardEnabled: true,
  uploadAuthRequired: false,
  assetsAuthRequired: false,
  imageCompressionEnabled: true,
  imageCompressionLevel: "low",
  pruneDays: 0,
  pruneGb: 0,
  oidcIssuerUrl: value(env.OIDC_ISSUER_URL).replace(/\/$/, ""),
  oidcClientId: value(env.OIDC_CLIENT_ID),
  oidcClientSecret: value(env.OIDC_CLIENT_SECRET),
  oidcRedirectUri: value(env.OIDC_REDIRECT_URI, `${appOrigin}/auth/callback`),
  adminEmail: value(env.ADMIN_EMAIL),
  sessionSecret: value(env.SESSION_SECRET),
  cookieDomain
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

function normalizeCookieDomain(input: string): string {
  if (!input) return "";
  try {
    const parsed = input.startsWith("http://") || input.startsWith("https://") ? new URL(input).hostname : input;
    return parsed.replace(/\/.*$/, "").replace(/:\d+$/, "");
  } catch {
    return input.replace(/\/.*$/, "").replace(/:\d+$/, "");
  }
}
