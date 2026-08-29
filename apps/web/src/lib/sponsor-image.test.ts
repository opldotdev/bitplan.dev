import { describe, expect, test } from "bun:test";

import {
  calculateSponsorCrop,
  MAX_SPONSOR_IMAGE_BYTES,
  validateSponsorImage,
} from "./sponsor-image";

describe("calculateSponsorCrop", () => {
  test("crops a square source to a wide tier and honors horizontal position", () => {
    const crop = calculateSponsorCrop({
      crop: { x: 100, y: 50, zoom: 1 },
      sourceHeight: 1000,
      sourceWidth: 1000,
      targetHeight: 100,
      targetWidth: 300,
    });
    expect(crop.height).toBeCloseTo(1000 / 3);
    expect(crop.width).toBe(1000);
    expect(crop.x).toBe(0);
    expect(crop.y).toBeCloseTo(1000 / 3);
  });

  test("zooms into the selected image position", () => {
    expect(
      calculateSponsorCrop({
        crop: { x: 100, y: 0, zoom: 2 },
        sourceHeight: 500,
        sourceWidth: 1000,
        targetHeight: 250,
        targetWidth: 500,
      })
    ).toEqual({ height: 250, width: 500, x: 500, y: 0 });
  });
});

describe("validateSponsorImage", () => {
  test("accepts supported image types within the source limit", () => {
    expect(() =>
      validateSponsorImage({ size: MAX_SPONSOR_IMAGE_BYTES, type: "image/png" })
    ).not.toThrow();
  });

  test("rejects active SVG content and oversized sources", () => {
    expect(() =>
      validateSponsorImage({ size: 100, type: "image/svg+xml" })
    ).toThrow("PNG, JPEG, WebP, AVIF, or GIF");
    expect(() =>
      validateSponsorImage({
        size: MAX_SPONSOR_IMAGE_BYTES + 1,
        type: "image/png",
      })
    ).toThrow("20 MiB");
  });
});
