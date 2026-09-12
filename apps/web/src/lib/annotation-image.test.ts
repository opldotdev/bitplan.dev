import { expect, test } from "bun:test";
import { fittedImage } from "./annotation-image";

test("photo fitting preserves proportions, never upscales, and bounds decoded area", () => {
  expect(fittedImage(4000, 3000)).toEqual({ height: 1200, width: 1600 });
  expect(fittedImage(200, 100)).toEqual({ height: 100, width: 200 });
  expect(() => fittedImage(10_000, 10_000)).toThrow();
  expect(() => fittedImage(0, 100)).toThrow();
});
