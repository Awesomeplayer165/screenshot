export const DEFAULT_UPLOAD_LIMIT_MB = 25;
export const MAX_UPLOAD_BYTES = DEFAULT_UPLOAD_LIMIT_MB * 1024 * 1024;

export const SUPPORTED_IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
} as const;

export type SupportedImageType = keyof typeof SUPPORTED_IMAGE_TYPES;

export type UploadStatus = "reserved" | "complete" | "failed";

export type ReserveUploadResponse = {
  id: string;
  uploadUrl: string;
  assetUrl: string;
  maxUploadBytes: number;
};

export type ReserveUploadRequest = {
  mimeType: SupportedImageType;
};

export type UploadCompleteResponse = {
  id: string;
  assetUrl: string;
  sizeBytes: number;
  originalSizeBytes: number;
};

export type ApiErrorResponse = {
  error: string;
};

export type AdminUpload = {
  id: string;
  status: UploadStatus;
  mimeType: string | null;
  extension: string | null;
  sizeBytes: number | null;
  originalSizeBytes: number | null;
  storagePath: string | null;
  publicUrl: string | null;
  createdAt: string;
  completedAt: string | null;
  sha256: string | null;
};

export type AppSettings = {
  adminDashboardEnabled: boolean;
  uploadAuthRequired: boolean;
  assetsAuthRequired: boolean;
  maxUploadMb: number;
  imageCompressionEnabled: boolean;
  oidcIssuerUrl: string;
  oidcClientId: string;
  oidcRedirectUri: string;
  adminEmail: string;
  oidcConfigured: boolean;
  appOrigin: string;
  assetOrigin: string;
};

export type AdminSummary = {
  settings: AppSettings;
  uploads: AdminUpload[];
  storageBytes: number;
};
