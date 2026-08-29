import { describe, expect, test } from "bun:test";

import { SPONSOR_TIERS } from "./sponsors";

describe("SPONSOR_TIERS", () => {
  test("defines a positive planned price for every tier", () => {
    expect(SPONSOR_TIERS.every((tier) => tier.priceUsd > 0)).toBe(true);
  });

  test("assigns a unique ID to every planned slot", () => {
    const slotIds = SPONSOR_TIERS.flatMap((tier) => tier.slotIds);

    expect(new Set(slotIds).size).toBe(slotIds.length);
  });
});
