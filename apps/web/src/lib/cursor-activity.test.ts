import { expect, test } from "bun:test";
import { cursorIsActive, cursorStatus, cursorTimeAgo } from "./cursor-activity";

test("actual tool activities expire and disconnected sessions do not claim activity", () => {
  for (const [activity, label] of [
    ["read", "Agent read"],
    ["edit", "Agent edit"],
    ["annotate", "Agent annotation"],
  ] as const) {
    expect(
      cursorStatus({ activity, online: true, updatedAt: 1000 }, 1001)
    ).toBe(label);
    expect(
      cursorStatus({ activity, online: true, updatedAt: 1000 }, 7000)
    ).toBe("connected");
    expect(
      cursorStatus({ activity, online: false, updatedAt: 1000 }, 1001)
    ).toBe("just now");
  }
});

test("idle and disconnected avatars retain their place without a cursor arrow", () => {
  expect(cursorIsActive(true, 1000, 2000)).toBe(true);
  expect(cursorIsActive(true, 1000, 31_000)).toBe(false);
  expect(cursorIsActive(false, 1000, 2000)).toBe(false);
  expect(cursorIsActive(true, 0, 2000)).toBe(false);
});

test("cursor age handles relative time boundaries without inventing missing timestamps", () => {
  const start = 1000;
  for (const [elapsed, label] of [
    [0, "just now"],
    [59_999, "just now"],
    [60_000, "1 min ago"],
    [180_000, "3 mins ago"],
    [3_600_000, "1 hr ago"],
    [7_200_000, "2 hrs ago"],
    [86_400_000, "1 day ago"],
    [172_800_000, "2 days ago"],
  ] as const) {
    expect(cursorTimeAgo(start, start + elapsed)).toBe(label);
  }
  expect(cursorTimeAgo(start, start - 1000)).toBe("just now");
  expect(cursorTimeAgo(0, start)).toBe("Time unavailable");
  expect(cursorTimeAgo(Number.NaN, start)).toBe("Time unavailable");
});
