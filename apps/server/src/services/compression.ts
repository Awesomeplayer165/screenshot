import type { CompressionLevel, SupportedImageType } from "@screenshot/shared";
import type sharp from "sharp";

let sharpLoader: Promise<typeof sharp | null> | null = null;

export type ProcessedImage = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
};

export async function processImage(
  bytes: Uint8Array,
  mimeType: SupportedImageType,
  enabled: boolean,
  level: CompressionLevel
): Promise<ProcessedImage> {
  if (!enabled && mimeType !== "image/heic" && mimeType !== "image/heif") {
    return withOriginalType(bytes, mimeType);
  }

  const sharp = await loadSharp();
  if (!sharp) {
    if (mimeType === "image/heic" || mimeType === "image/heif") {
      throw new Error("HEIC/HEIF conversion requires image compression support on the server.");
    }

    return withOriginalType(bytes, mimeType);
  }

  const image = sharp(bytes, { animated: false, limitInputPixels: false }).rotate();
  let output: Buffer;

  if (mimeType === "image/png") {
    output = await image.png({ compressionLevel: compressionOptions(level).png, adaptiveFiltering: true, effort: compressionOptions(level).effort }).toBuffer();
    return withBestResult(bytes, output, "image/png", "png");
  } else if (mimeType === "image/jpeg") {
    return withOriginalType(bytes, mimeType);
  } else if (mimeType === "image/webp") {
    output = await image.webp({ lossless: true, effort: compressionOptions(level).effort }).toBuffer();
    return withBestResult(bytes, output, "image/webp", "webp");
  }

  output = await image.jpeg({ quality: 98, mozjpeg: true }).toBuffer();
  return { bytes: new Uint8Array(output), mimeType: "image/jpeg", extension: "jpg" };
}

async function loadSharp() {
  sharpLoader ??= import("sharp")
    .then((module) => module.default)
    .catch(() => {
      console.warn("Image compression unavailable; storing original images.");
      return null;
    });

  return sharpLoader;
}

function compressionOptions(level: CompressionLevel): { png: number; effort: number } {
  if (level === "high") return { png: 9, effort: 6 };
  if (level === "medium") return { png: 8, effort: 4 };
  return { png: 6, effort: 2 };
}

function withBestResult(bytes: Uint8Array, output: Buffer, mimeType: ProcessedImage["mimeType"], extension: ProcessedImage["extension"]): ProcessedImage {
  return {
    bytes: output.byteLength < bytes.byteLength ? new Uint8Array(output) : bytes,
    mimeType,
    extension
  };
}

function withOriginalType(bytes: Uint8Array, mimeType: SupportedImageType): ProcessedImage {
  if (mimeType === "image/png") return { bytes, mimeType, extension: "png" };
  if (mimeType === "image/webp") return { bytes, mimeType, extension: "webp" };
  return { bytes, mimeType: "image/jpeg", extension: "jpg" };
}
