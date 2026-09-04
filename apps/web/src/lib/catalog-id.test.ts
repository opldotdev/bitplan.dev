import { describe, expect, test } from "bun:test";

import { CATALOG_CONTENT_TYPE, isCatalogId } from "./catalog-id";

describe("catalog ids", () => {
  test("content type is the frozen catalog media type", () => {
    expect(CATALOG_CONTENT_TYPE).toBe("application/x-bitplan-catalog");
  });

  test("accepts c_ plus 43 base64url characters", () => {
    expect(isCatalogId(`c_${"a".repeat(43)}`)).toBe(true);
    expect(isCatalogId(`c_${"AZaz09-_".repeat(5)}aaa`)).toBe(true);
  });

  test("rejects malformed ids", () => {
    expect(isCatalogId("")).toBe(false);
    expect(isCatalogId("c_short")).toBe(false);
    expect(isCatalogId(`c_${"a".repeat(42)}`)).toBe(false);
    expect(isCatalogId(`c_${"a".repeat(44)}`)).toBe(false);
    expect(isCatalogId(`h_${"a".repeat(43)}`)).toBe(false);
    expect(isCatalogId(`C_${"a".repeat(43)}`)).toBe(false);
    expect(isCatalogId(`c_${"a".repeat(42)}!`)).toBe(false);
    expect(isCatalogId(` c_${"a".repeat(43)}`)).toBe(false);
  });
});
