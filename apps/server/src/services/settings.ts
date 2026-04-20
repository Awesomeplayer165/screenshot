import type { AppSettings } from "@screenshot/shared";
import { config } from "../config";
import { getSetting, setSetting } from "./db";

function booleanSetting(key: keyof AppSettings, fallback: boolean): boolean {
  const value = getSetting(key);
  if (value === null) return fallback;
  return value === "true";
}

function numberSetting(key: keyof AppSettings, fallback: number): number {
  const value = getSetting(key);
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stringSetting(key: keyof AppSettings, fallback: string): string {
  return getSetting(key) ?? fallback;
}

export function getSettings(): AppSettings {
  const oidcIssuerUrl = stringSetting("oidcIssuerUrl", config.oidcIssuerUrl);
  const oidcClientId = stringSetting("oidcClientId", config.oidcClientId);
  const oidcRedirectUri = stringSetting("oidcRedirectUri", config.oidcRedirectUri);
  const adminEmail = stringSetting("adminEmail", config.adminEmail);

  return {
    adminDashboardEnabled: booleanSetting("adminDashboardEnabled", config.adminDashboardEnabled),
    uploadAuthRequired: booleanSetting("uploadAuthRequired", config.uploadAuthRequired),
    assetsAuthRequired: booleanSetting("assetsAuthRequired", config.assetsAuthRequired),
    maxUploadMb: numberSetting("maxUploadMb", config.defaultUploadLimitMb),
    imageCompressionEnabled: booleanSetting("imageCompressionEnabled", config.imageCompressionEnabled),
    oidcIssuerUrl,
    oidcClientId,
    oidcRedirectUri,
    adminEmail,
    oidcConfigured: Boolean(oidcIssuerUrl && oidcClientId && getOidcClientSecret() && adminEmail),
    appOrigin: config.appOrigin,
    assetOrigin: config.assetOrigin
  };
}

export function getMaxUploadBytes(): number {
  return Math.round(getSettings().maxUploadMb * 1024 * 1024);
}

export function updateSettings(input: Partial<AppSettings> & { oidcClientSecret?: string }): AppSettings {
  const booleans: Array<keyof AppSettings> = ["adminDashboardEnabled", "uploadAuthRequired", "assetsAuthRequired", "imageCompressionEnabled"];
  for (const key of booleans) {
    if (typeof input[key] === "boolean") setSetting(key, String(input[key]));
  }

  if (typeof input.maxUploadMb === "number" && Number.isFinite(input.maxUploadMb) && input.maxUploadMb > 0) {
    setSetting("maxUploadMb", String(input.maxUploadMb));
  }

  const strings: Array<keyof AppSettings> = ["oidcIssuerUrl", "oidcClientId", "oidcRedirectUri", "adminEmail"];
  for (const key of strings) {
    const value = input[key];
    if (typeof value === "string") setSetting(key, value.trim());
  }

  if (typeof input.oidcClientSecret === "string" && input.oidcClientSecret.trim()) {
    setSetting("oidcClientSecret", input.oidcClientSecret.trim());
  }

  return getSettings();
}

export function getOidcClientSecret(): string {
  return getSetting("oidcClientSecret") ?? config.oidcClientSecret;
}
