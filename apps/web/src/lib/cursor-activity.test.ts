import { expect, test } from "bun:test";
import { cursorIsActive } from "./cursor-activity";

test("idle and disconnected avatars retain their place without a cursor arrow", () => {
  expect(cursorIsActive(true, 1000, 2000)).toBe(true);
  expect(cursorIsActive(true, 1000, 31_000)).toBe(false);
  expect(cursorIsActive(false, 1000, 2000)).toBe(false);
  expect(cursorIsActive(true, 0, 2000)).toBe(false);
});
