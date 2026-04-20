export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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
};

export type ApiErrorResponse = {
  error: string;
};
