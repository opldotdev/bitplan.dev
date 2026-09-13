import { expect, test } from "bun:test";
import { IMAGE_LIMIT, prepareAnnotationImage } from "./annotation-image";
import { pendingSticker, STICKERS } from "./annotation-stickers";
import { parseAnnotationContent } from "./annotations";

test("pending sticker is an inert image with a separate bounded agent request", () => {
  const image = pendingSticker("  A rocket <script>alert(1)</script>  ");
  expect(image.alt).toContain("Pending image generation request: A rocket");
  expect(atob(image.dataUrl.split(",")[1])).not.toContain("<script>");
  expect(atob(image.dataUrl.split(",")[1])).toContain("Waiting for your agent");
  expect(() => pendingSticker(" ")).toThrow();
  expect(() => pendingSticker("a".repeat(1201))).toThrow();
  expect(STICKERS.every((sticker) => sticker.src.startsWith("/"))).toBe(true);
  expect(parseAnnotationContent({ ...image, type: "image" })).toEqual({
    ...image,
    type: "image",
  });
  expect(
    parseAnnotationContent({
      ...pendingSticker("a".repeat(1200)),
      type: "image",
    }).type
  ).toBe("image");
});

test("uploads reject unsupported content and oversized vector assets before decoding", async () => {
  await expect(
    prepareAnnotationImage(new Blob(["not an image"], { type: "text/html" }))
  ).rejects.toThrow("Choose PNG");
  await expect(
    prepareAnnotationImage(
      new Blob(["x".repeat(IMAGE_LIMIT + 1)], { type: "image/svg+xml" })
    )
  ).rejects.toThrow("under 170 KB");
});
