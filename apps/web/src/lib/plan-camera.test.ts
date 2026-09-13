import { expect, test } from "bun:test";
import { zoomPlanCamera } from "./plan-camera";

test("zoom preserves the point under the wheel and bounds magnification", () => {
  const before = { scale: 1, x: 120, y: -300 };
  const after = zoomPlanCamera(before, 400, 200, -100);
  expect((400 - after.x) / after.scale).toBeCloseTo(280);
  expect((200 - after.y) / after.scale).toBeCloseTo(500);
  expect(zoomPlanCamera({ ...before, scale: 4 }, 0, 0, -200).scale).toBe(4);
  expect(zoomPlanCamera({ ...before, scale: 0.25 }, 0, 0, 200).scale).toBe(
    0.25
  );
});
