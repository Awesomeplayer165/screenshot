import { SUPPORTED_IMAGE_TYPES, type SupportedImageType } from "@screenshot/shared";

export function normalizeImageType(contentType: string | null | undefined): SupportedImageType | null {
  if (!contentType) return null;
  const mime = contentType.split(";")[0]?.trim().toLowerCase();
  if (!mime) return null;
  return mime in SUPPORTED_IMAGE_TYPES ? (mime as SupportedImageType) : null;
}

export function extensionForType(mime: SupportedImageType): string {
  return SUPPORTED_IMAGE_TYPES[mime];
}

export function looksLikeImage(bytes: Uint8Array, mime: SupportedImageType): boolean {
  if (mime === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }

  if (mime === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mime === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }

  if (mime === "image/heic" || mime === "image/heif") {
    const brand = String.fromCharCode(...bytes.slice(4, 12));
    return brand.startsWith("ftyp") && /heic|heix|hevc|hevx|mif1|msf1/.test(brand + String.fromCharCode(...bytes.slice(12, 32)));
  }

  return false;
}
