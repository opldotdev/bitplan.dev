import { describe, expect, test } from "bun:test";

import {
  isOutpoint,
  normalizeOrigin,
  splitOutpoint,
  toOrdinalOutpoint,
} from "./outpoint";
import {
  clampVersion,
  parseVersionQuery,
  seqToVersion,
  versionToSeq,
} from "./version";

const NOT_OUTPOINT = /Not an outpoint/;
const TXID = "a".repeat(64);

describe("outpoint normalization", () => {
  test("accepts underscore spelling and lowercases the txid", () => {
    expect(toOrdinalOutpoint(`${TXID.toUpperCase()}_3`)).toBe(`${TXID}_3`);
  });

  test("accepts dot spelling and normalizes to underscore", () => {
    expect(toOrdinalOutpoint(`${TXID}.7`)).toBe(`${TXID}_7`);
  });

  test("splits either spelling", () => {
    expect(splitOutpoint(`${TXID}_2`)).toEqual({ txid: TXID, vout: 2 });
    expect(splitOutpoint(`${TXID}.2`)).toEqual({ txid: TXID, vout: 2 });
  });

  test("rejects a string that is not an outpoint", () => {
    expect(isOutpoint("not-an-outpoint")).toBe(false);
    expect(isOutpoint("abc_0")).toBe(false);
    expect(isOutpoint(`${TXID}-0`)).toBe(false);
    expect(() => toOrdinalOutpoint("nope")).toThrow(NOT_OUTPOINT);
  });

  test("normalizeOrigin decodes a viewer path segment", () => {
    expect(normalizeOrigin(`${TXID}.0`)).toBe(`${TXID}_0`);
    expect(normalizeOrigin(`${TXID}_0`)).toBe(`${TXID}_0`);
    expect(normalizeOrigin("bad")).toBeNull();
  });
});

describe("version query normalization", () => {
  test("parses a 1-based version", () => {
    expect(parseVersionQuery("1")).toBe(1);
    expect(parseVersionQuery("12")).toBe(12);
  });

  test("rejects missing, zero, negative, and junk", () => {
    expect(parseVersionQuery(undefined)).toBeNull();
    expect(parseVersionQuery(null)).toBeNull();
    expect(parseVersionQuery("")).toBeNull();
    expect(parseVersionQuery("0")).toBeNull();
    expect(parseVersionQuery("-1")).toBeNull();
    expect(parseVersionQuery("1.5")).toBeNull();
    expect(parseVersionQuery("v3")).toBeNull();
  });

  test("maps 1-based display versions to 0-based ORDFS seq", () => {
    expect(versionToSeq(1)).toBe(0);
    expect(seqToVersion(0)).toBe(1);
    expect(versionToSeq(4)).toBe(3);
    expect(seqToVersion(3)).toBe(4);
  });

  test("clamps a requested version into the published range", () => {
    expect(clampVersion(1, 3)).toBe(1);
    expect(clampVersion(3, 3)).toBe(3);
    expect(clampVersion(9, 3)).toBe(3);
    expect(clampVersion(0, 3)).toBe(1);
  });
});
