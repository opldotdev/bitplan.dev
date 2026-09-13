import { expect, test } from "bun:test";
import {
  annotationCardOffset,
  moveAnnotationPlacement,
} from "./annotation-position";

test("drag offsets accumulate, survive serialization, and respect annotation bounds", () => {
  const placement = { dx: 30, dy: -20 };
  const moved = moveAnnotationPlacement(placement, { x: 70.2, y: 40.4 });
  expect(moved).toEqual({ dx: 100, dy: 20 });
  expect(
    moveAnnotationPlacement(JSON.parse(JSON.stringify(moved)), { x: -10, y: 5 })
  ).toEqual({ dx: 90, dy: 25 });
  expect(placement).toEqual({ dx: 30, dy: -20 });
  expect(moveAnnotationPlacement(moved, { x: 100_000, y: -100_000 })).toEqual({
    dx: 10_000,
    dy: -10_000,
  });
});

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
