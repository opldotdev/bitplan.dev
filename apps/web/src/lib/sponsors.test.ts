import { describe, expect, test } from "bun:test";

import { usdToSatoshis } from "./sponsors";

const POSITIVE_NUMBER = /positive number/;

describe("usdToSatoshis", () => {
  test("converts dollars at a USD-per-BSV rate", () => {
    expect(usdToSatoshis(50, 50)).toBe(100_000_000);
    expect(usdToSatoshis(500, 16.58)).toBe(
      Math.ceil((500 / 16.58) * 100_000_000)
    );
  });

  test("rejects a non-positive rate", () => {
    expect(() => usdToSatoshis(50, 0)).toThrow(POSITIVE_NUMBER);
  });
});
