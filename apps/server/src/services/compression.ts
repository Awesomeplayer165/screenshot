import type { SupportedImageType } from "@screenshot/shared";
import type sharp from "sharp";

let sharpLoader: Promise<typeof sharp | null> | null = null;

export async function optimizeImage(bytes: Uint8Array, mimeType: SupportedImageType, enabled: boolean): Promise<Uint8Array> {
  if (!enabled) return bytes;
  const sharp = await loadSharp();
  if (!sharp) return bytes;

  const image = sharp(bytes, { animated: false, limitInputPixels: false }).rotate();
  let output: Buffer;

  if (mimeType === "image/png") {
    output = await image.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 7 }).toBuffer();
  } else if (mimeType === "image/jpeg") {
    return bytes;
  } else {
    output = await image.webp({ lossless: true, effort: 4 }).toBuffer();
  }

  return output.byteLength < bytes.byteLength ? new Uint8Array(output) : bytes;
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
