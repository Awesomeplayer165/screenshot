import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  type ApiErrorResponse,
  type ReserveUploadRequest,
  type ReserveUploadResponse,
  type UploadCompleteResponse
} from "@screenshot/shared";
import { config } from "../config";
import { createReservedUpload, findUpload, markUploadComplete, markUploadFailed } from "../services/db";
import { createId } from "../services/ids";
import { processImage } from "../services/compression";
import { getMaxUploadBytes, getSettings } from "../services/settings";
import { removeTemp, storeUpload } from "../services/storage";
import { extensionForType, looksLikeImage, normalizeImageType } from "../services/validation";

export const uploads = new Hono();

function assetUrlFor(id: string, extension = "png"): string {
  return `${config.assetOrigin.replace(/\/$/, "")}/${id}.${extension}`;
}

uploads.post("/", async (c) => {
  let payload: ReserveUploadRequest;

  try {
    payload = (await c.req.json()) as ReserveUploadRequest;
  } catch {
    return c.json<ApiErrorResponse>({ error: "Upload reservation requires an image type" }, 400);
  }

  const mimeType = normalizeImageType(payload.mimeType);
  if (!mimeType) {
    return c.json<ApiErrorResponse>({ error: "Only PNG, JPEG, WebP, HEIC, and HEIF images are supported" }, 415);
  }

  const extension = extensionForType(mimeType);

  for (let attempts = 0; attempts < 8; attempts += 1) {
    const id = createId(config.idLength);
    const publicUrl = assetUrlFor(id, extension);

    try {
      createReservedUpload(id, publicUrl);

      return c.json<ReserveUploadResponse>({
        id,
        uploadUrl: `${config.appOrigin.replace(/\/$/, "")}/api/uploads/${id}`,
        assetUrl: publicUrl,
        maxUploadBytes: getMaxUploadBytes()
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) continue;
      throw error;
    }
  }

  throw new HTTPException(500, { message: "Could not allocate upload id" });
});

uploads.put("/:id", async (c) => {
  const id = c.req.param("id");
  const record = findUpload(id);

  if (!record) {
    return c.json<ApiErrorResponse>({ error: "Upload id was not reserved" }, 404);
  }

  if (record.status !== "reserved") {
    return c.json<ApiErrorResponse>({ error: "Upload is no longer writable" }, 409);
  }

  const maxUploadBytes = getMaxUploadBytes();
  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (contentLength > maxUploadBytes) {
    markUploadFailed(id);
    return c.json<ApiErrorResponse>({ error: `Image is larger than ${getSettings().maxUploadMb} MB` }, 413);
  }

  const mimeType = normalizeImageType(c.req.header("content-type"));
  if (!mimeType) {
    markUploadFailed(id);
    return c.json<ApiErrorResponse>({ error: "Only PNG, JPEG, WebP, HEIC, and HEIF images are supported" }, 415);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) {
    markUploadFailed(id);
    return c.json<ApiErrorResponse>({ error: "Upload body is empty" }, 400);
  }

  if (body.byteLength > maxUploadBytes) {
    markUploadFailed(id);
    return c.json<ApiErrorResponse>({ error: `Image is larger than ${getSettings().maxUploadMb} MB` }, 413);
  }

  const originalBytes = new Uint8Array(body);
  if (!looksLikeImage(originalBytes, mimeType)) {
    markUploadFailed(id);
    return c.json<ApiErrorResponse>({ error: "Uploaded bytes do not match the image type" }, 415);
  }

  let extension = extensionForType(mimeType);

  try {
    const settings = getSettings();
    const processed = await processImage(originalBytes, mimeType, settings.imageCompressionEnabled, settings.imageCompressionLevel);
    extension = processed.extension;
    const stored = await storeUpload(id, extension, processed.bytes);
    const completed = markUploadComplete({
      id,
      mimeType: processed.mimeType,
      extension,
      sizeBytes: stored.sizeBytes,
      originalSizeBytes: originalBytes.byteLength,
      storagePath: stored.path,
      sha256: stored.sha256
    });

    if (!completed) {
      return c.json<ApiErrorResponse>({ error: "Upload was already changed" }, 409);
    }

    return c.json<UploadCompleteResponse>({
      id,
      assetUrl: assetUrlFor(id, extension),
      sizeBytes: stored.sizeBytes,
      originalSizeBytes: originalBytes.byteLength
    });
  } catch (error) {
    await removeTemp(id, extension);
    markUploadFailed(id);

    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return c.json<ApiErrorResponse>({ error: "Upload file already exists" }, 409);
    }

    if (error instanceof Error && error.message.includes("HEIC/HEIF")) {
      return c.json<ApiErrorResponse>({ error: error.message }, 415);
    }

    throw error;
  }
});
