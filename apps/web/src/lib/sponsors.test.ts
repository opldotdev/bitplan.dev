import { describe, expect, test } from "bun:test";

import {
  SPONSOR_LINK_TIER,
  SPONSOR_SLOT_IDS,
  SPONSOR_TIERS,
  sponsorHostKey,
  sponsorImageUrl,
  sponsorNameKey,
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

  test("keeps the link tier out of the fixed slot list", () => {
    expect(SPONSOR_SLOT_IDS).not.toContain("link");
    expect(SPONSOR_LINK_TIER.priceUsd).toBe(10);
    expect(SPONSOR_LINK_TIER.imageWidth).toBe(SPONSOR_LINK_TIER.imageHeight);
  });
});

describe("sponsor identity keys", () => {
  test("recognizes the same sponsor across www and casing", () => {
    expect(sponsorHostKey("https://www.Example.com/pricing")).toBe(
      sponsorHostKey("https://example.com/")
    );
    expect(sponsorHostKey("not a url")).toBeNull();
    expect(sponsorNameKey("  Acme ")).toBe(sponsorNameKey("acme"));
  });
});
