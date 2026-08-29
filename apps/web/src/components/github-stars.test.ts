import { describe, expect, test } from "bun:test";

import { readStarCount } from "./github-stars";

describe("readStarCount", () => {
  test("accepts GitHub's public star count", () => {
    expect(readStarCount({ stargazers_count: 0 })).toBe(0);
    expect(readStarCount({ stargazers_count: 42 })).toBe(42);
  });

  test("rejects missing or malformed counts", () => {
    expect(readStarCount({})).toBeNull();
    expect(readStarCount({ stargazers_count: "42" })).toBeNull();
  });
});
