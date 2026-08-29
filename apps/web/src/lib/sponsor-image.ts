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

export interface SponsorCrop {
  x: number;
  y: number;
  zoom: number;
}

export interface SourceCrop {
  height: number;
  width: number;
  x: number;
  y: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function validateSponsorImage(file: Pick<File, "size" | "type">): void {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choose a PNG, JPEG, WebP, AVIF, or GIF image.");
  }
  if (file.size <= 0 || file.size > MAX_SPONSOR_IMAGE_BYTES) {
    throw new Error("Choose an image no larger than 20 MiB.");
  }
}

export function calculateSponsorCrop({
  crop,
  sourceHeight,
  sourceWidth,
  targetHeight,
  targetWidth,
}: {
  crop: SponsorCrop;
  sourceHeight: number;
  sourceWidth: number;
  targetHeight: number;
  targetWidth: number;
}): SourceCrop {
  const targetRatio = targetWidth / targetHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  const coverWidth =
    sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth;
  const coverHeight =
    sourceRatio > targetRatio ? sourceHeight : sourceWidth / targetRatio;
  const zoom = clamp(crop.zoom, 1, 3);
  const width = coverWidth / zoom;
  const height = coverHeight / zoom;
  const x = (sourceWidth - width) * (clamp(crop.x, 0, 100) / 100);
  const y = (sourceHeight - height) * (clamp(crop.y, 0, 100) / 100);
  return { height, width, x, y };
}

export function drawSponsorImage(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement,
  tier: SponsorTier,
  crop: SponsorCrop
): void {
  canvas.width = tier.imageWidth;
  canvas.height = tier.imageHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot prepare the sponsor image.");
  }
  const sourceCrop = calculateSponsorCrop({
    crop,
    sourceHeight: source.naturalHeight,
    sourceWidth: source.naturalWidth,
    targetHeight: tier.imageHeight,
    targetWidth: tier.imageWidth,
  });
  context.clearRect(0, 0, tier.imageWidth, tier.imageHeight);
  context.drawImage(
    source,
    sourceCrop.x,
    sourceCrop.y,
    sourceCrop.width,
    sourceCrop.height,
    0,
    0,
    tier.imageWidth,
    tier.imageHeight
  );
}

export async function loadSponsorImage(file: File): Promise<HTMLImageElement> {
  validateSponsorImage(file);
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) {
      throw new Error("The selected image could not be decoded.");
    }
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
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
  canvas: HTMLCanvasElement
): Promise<Blob> {
  for (const quality of WEBP_QUALITIES) {
    // biome-ignore lint/performance/noAwaitInLoops: quality must fall sequentially so we retain the highest acceptable quality.
    const blob = await canvasToWebp(canvas, quality);
    if (blob.size <= MAX_SPONSOR_WEBP_BYTES) {
      return blob;
    }
  }
  throw new Error("The cropped image cannot be compressed below 200 KiB.");
}
