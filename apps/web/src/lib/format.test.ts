import { describe, expect, test } from "bun:test";

import {
  draftShareDescription,
  formatByteSize,
  truncateMiddle,
} from "./format";

const ORIGIN = `${"a".repeat(64)}_0`;

describe("draft share copy", () => {
  test("invalid origin stays generic", () => {
    expect(draftShareDescription({ found: false, origin: null })).toBe(
      "Encrypted draft."
    );
  });

  test("missing draft names the origin", () => {
    expect(draftShareDescription({ found: false, origin: ORIGIN })).toBe(
      `No draft at ${truncateMiddle(ORIGIN)}.`
    );
  });

  test("found draft lists public size and version", () => {
    expect(
      draftShareDescription({
        byteLength: 53_681,
        found: true,
        origin: ORIGIN,
        version: 1,
      })
    ).toBe(`Encrypted draft ${truncateMiddle(ORIGIN)}. 52.4 KB, v1.`);
  });
});

describe("formatByteSize", () => {
  test("formats bytes and kilobytes", () => {
    expect(formatByteSize(1)).toBe("1 byte");
    expect(formatByteSize(53_681)).toBe("52.4 KB");
  });
});
