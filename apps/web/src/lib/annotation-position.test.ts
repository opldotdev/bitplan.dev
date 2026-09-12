import { expect, test } from "bun:test";
import { annotationCardOffset } from "./annotation-position";

test("cards start at the anchor when space allows and stay visible at narrow edges", () => {
  expect(
    annotationCardOffset(
      { x: 700, y: 270 },
      { height: 720, width: 1280 },
      { height: 160, width: 256 }
    )
  ).toEqual({ x: 0, y: 0 });
  expect(
    annotationCardOffset(
      { x: 220, y: 800 },
      { height: 844, width: 390 },
      { height: 160, width: 256 }
    )
  ).toEqual({ x: -220, y: -160 });
});
