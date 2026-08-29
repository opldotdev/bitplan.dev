import type { SponsorTier } from "@/lib/sponsors";

export const MAX_SPONSOR_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_SPONSOR_WEBP_BYTES = 200 * 1024;

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const WEBP_QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3] as const;

export interface SourceCrop {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface LoadedSponsorImage {
  element: HTMLImageElement;
  url: string;
}

export function validateSponsorImage(file: Pick<File, "size" | "type">): void {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choose a PNG, JPEG, WebP, AVIF, or GIF image.");
  }
  if (file.size <= 0 || file.size > MAX_SPONSOR_IMAGE_BYTES) {
    throw new Error("Choose an image no larger than 20 MiB.");
  }
}

export async function loadSponsorImage(
  file: File
): Promise<LoadedSponsorImage> {
  validateSponsorImage(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) {
      throw new Error("The selected image could not be decoded.");
    }
    return { element: image, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToWebp(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob?.type !== "image/webp") {
          reject(new Error("This browser cannot export WebP images."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}

export async function exportSponsorWebp(
  source: HTMLImageElement,
  tier: SponsorTier,
  crop: SourceCrop
): Promise<Blob> {
  if (
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
    crop.width <= 0 ||
    crop.height <= 0
  ) {
    throw new Error("Choose a valid image crop.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = tier.imageWidth;
  canvas.height = tier.imageHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot prepare the sponsor image.");
  }
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    tier.imageWidth,
    tier.imageHeight
  );
  for (const quality of WEBP_QUALITIES) {
    // biome-ignore lint/performance/noAwaitInLoops: quality must fall sequentially so we retain the highest acceptable quality.
    const blob = await canvasToWebp(canvas, quality);
    if (blob.size <= MAX_SPONSOR_WEBP_BYTES) {
      return blob;
    }
  }
  throw new Error("The cropped image cannot be compressed below 200 KiB.");
}
