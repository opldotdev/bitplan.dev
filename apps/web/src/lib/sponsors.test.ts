import { describe, expect, test } from "bun:test";

import {
  SPONSOR_SLOT_IDS,
  SPONSOR_TIERS,
  sponsorImageUrl,
  sponsorPriceUsd,
  sponsorSubtype,
} from "./sponsors";

describe("sponsor slots", () => {
  test("defines 30 unique fixed-price placements", () => {
    expect(SPONSOR_SLOT_IDS).toHaveLength(30);
    expect(new Set(SPONSOR_SLOT_IDS).size).toBe(30);
    for (const tier of SPONSOR_TIERS) {
      expect(tier.imageWidth).toBeGreaterThan(tier.imageHeight);
      expect(tier.priceUsd).toBeGreaterThan(0);
    }
  });

  test("uses slot-specific MAP discovery tags and local images", () => {
    expect(sponsorSubtype("gold-1")).toBe("bitplanSponsorSlot:gold-1");
    expect(sponsorImageUrl("gold-1")).toBe("/api/sponsors/gold-1/image");
  });

  test("keeps one cheap test slot without changing its tier", () => {
    const silver = SPONSOR_TIERS.find(({ id }) => id === "silver");
    expect(silver).toBeDefined();
    if (!silver) {
      return;
    }
    expect(sponsorPriceUsd("silver-1", silver)).toBe(0.25);
    expect(sponsorPriceUsd("silver-2", silver)).toBe(silver.priceUsd);
  });
});
