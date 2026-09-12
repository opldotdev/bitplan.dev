export const IMAGE_LIMIT = 170_000;
const SUPPORTED_IMAGE_TYPE = /^image\/(png|jpeg|webp|gif|svg\+xml)$/;
export function fittedImage(width: number, height: number, edge = 1600) {
  if (!(width > 0 && height > 0) || width * height > 40_000_000) {
    throw new Error("Choose an image under 40 megapixels.");
  }
  const scale = Math.min(1, edge / Math.max(width, height));
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}
export async function prepareAnnotationImage(file: Blob): Promise<string> {
  if (file.size > 20_000_000) {
    throw new Error("Choose an image smaller than 20 MB.");
  }
  if (!SUPPORTED_IMAGE_TYPE.test(file.type)) {
    throw new Error(
      "Choose PNG, JPEG, WebP, GIF, or SVG. Export HEIC photos as JPEG first."
    );
  }
  const dataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read this image."));
      reader.readAsDataURL(blob);
    });
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    if (file.size > IMAGE_LIMIT) {
      throw new Error(
        "SVG and animated GIF files must be under 170 KB. Export a still image to resize it automatically."
      );
    }
    return dataUrl(file);
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This image could not be decoded. Try another file.");
  });
  try {
    let dimensions = fittedImage(bitmap.width, bitmap.height);
    if (file.size <= IMAGE_LIMIT) {
      return dataUrl(file);
    }
    const canvas = document.createElement("canvas");
    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Image processing is unavailable.");
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      // biome-ignore lint/performance/noAwaitInLoops: each resize depends on whether the previous, larger image met the encrypted payload limit
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.82)
      );
      if (blob && blob.size <= IMAGE_LIMIT) {
        return dataUrl(blob);
      }
      dimensions = fittedImage(
        dimensions.width,
        dimensions.height,
        Math.max(
          160,
          Math.floor(Math.max(dimensions.width, dimensions.height) * 0.7)
        )
      );
    }
    throw new Error("Image is still too large. Choose a smaller crop.");
  } finally {
    bitmap.close();
  }
}
