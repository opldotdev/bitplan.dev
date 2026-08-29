import { describe, expect, test } from "bun:test";

import { MAX_SPONSOR_IMAGE_BYTES, validateSponsorImage } from "./sponsor-image";

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
