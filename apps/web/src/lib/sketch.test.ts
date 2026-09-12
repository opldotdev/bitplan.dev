import { expect, test } from "bun:test";
import { insideLasso } from "./sketch";

test("lasso selects points inside a closed freehand boundary, not outside or empty paths", () => {
  const polygon = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  expect(insideLasso({ x: 50, y: 50 }, polygon)).toBe(true);
  expect(insideLasso({ x: 150, y: 50 }, polygon)).toBe(false);
  expect(insideLasso({ x: 50, y: 50 }, [])).toBe(false);
});
