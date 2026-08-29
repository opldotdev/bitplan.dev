import { describe, expect, test } from "bun:test";

import { rotateSponsorLinks } from "./sponsor-links";

const HOUR_MS = 3_600_000;

describe("rotateSponsorLinks", () => {
  test("keeps first-come order and advances one step per hour", () => {
    const links = ["a", "b", "c", "d"];
    expect(rotateSponsorLinks(links, 0)).toEqual(["a", "b", "c", "d"]);
    expect(rotateSponsorLinks(links, HOUR_MS)).toEqual(["b", "c", "d", "a"]);
    expect(rotateSponsorLinks(links, 2 * HOUR_MS)).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
    expect(rotateSponsorLinks(links, 4 * HOUR_MS)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  test("is stable within an hour so pagination stays consistent", () => {
    const links = ["a", "b", "c"];
    expect(rotateSponsorLinks(links, HOUR_MS + 1)).toEqual(
      rotateSponsorLinks(links, 2 * HOUR_MS - 1)
    );
  });

  test("handles an empty list", () => {
    expect(rotateSponsorLinks([], Date.now())).toEqual([]);
  });
});
