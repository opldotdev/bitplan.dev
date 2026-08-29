import { describe, expect, test } from "bun:test";

import {
  parseSponsorSlotOrigins,
  resolveSponsorSlots,
  SPONSOR_TIERS,
  type SponsorServices,
  sponsorImageUrl,
} from "./sponsors";

const ORIGIN = `${"a".repeat(64)}_0`;
const LISTING = `${"b".repeat(64)}_1`;
const IMAGE = `${"c".repeat(64)}_0`;

function services({
  map,
  listing = true,
}: {
  listing?: boolean;
  map?: Record<string, unknown>;
} = {}): SponsorServices {
  return {
    market: {
      getListingsByOrigins: () =>
        Promise.resolve(
          listing
            ? {
                [ORIGIN]: {
                  data: { ordlock: { origin: ORIGIN, price: 12_345 } },
                  outpoint: LISTING,
                },
              }
            : {}
        ),
    },
    ordfs: {
      bulkMetadata: () =>
        Promise.resolve({
          [`${ORIGIN}:-1`]: {
            contentLength: 100,
            contentType: "image/webp",
            map: map ?? {
              app: "bitplan",
              subType: "bitplanSponsorSlot",
              subTypeData: JSON.stringify({
                schema: 1,
                slot: "gold-1",
                tier: "gold",
              }),
              type: "ord",
            },
            origin: ORIGIN,
            outpoint: IMAGE,
          },
        }),
    },
  };
}

describe("SPONSOR_TIERS", () => {
  test("assigns unique slots with concrete image canvases", () => {
    const slotIds = SPONSOR_TIERS.flatMap((tier) => tier.slotIds);
    expect(new Set(slotIds).size).toBe(slotIds.length);
    for (const tier of SPONSOR_TIERS) {
      expect(tier.imageWidth).toBeGreaterThan(tier.imageHeight);
      expect(sponsorImageUrl(ORIGIN, tier)).toContain(
        `w=${tier.imageWidth}&h=${tier.imageHeight}`
      );
      expect(sponsorImageUrl(ORIGIN, tier)).toContain("fit=pad");
    }
  });
});

describe("parseSponsorSlotOrigins", () => {
  test("keeps only valid, unique origins for known slots", () => {
    const slots = parseSponsorSlotOrigins(
      JSON.stringify({
        "fake-1": ORIGIN,
        "gold-1": ORIGIN.replace("_", "."),
        "gold-2": ORIGIN,
        "gold-3": "not-an-outpoint",
      })
    );
    expect([...slots]).toEqual([["gold-1", ORIGIN]]);
  });

  test("fails closed for missing or malformed configuration", () => {
    expect(parseSponsorSlotOrigins(undefined).size).toBe(0);
    expect(parseSponsorSlotOrigins("not-json").size).toBe(0);
  });
});

describe("resolveSponsorSlots", () => {
  test("offers a configured slot only when its active listing and MAP agree", async () => {
    const slots = await resolveSponsorSlots({
      configuredSlots: new Map([["gold-1", ORIGIN]]),
      services: services(),
    });
    expect(slots.get("gold-1")).toMatchObject({
      listing: { outpoint: LISTING, priceSats: 12_345 },
      origin: ORIGIN,
      status: "available",
    });
  });

  test("renders valid latest sponsor metadata without a database", async () => {
    const slots = await resolveSponsorSlots({
      configuredSlots: new Map([["gold-1", ORIGIN]]),
      services: services({
        listing: false,
        map: {
          app: "bitplan",
          name: "Acme",
          subType: "bitplanSponsorSlot",
          subTypeData: JSON.stringify({
            href: "https://example.com",
            schema: 1,
            slot: "gold-1",
            tier: "gold",
          }),
          type: "ord",
        },
      }),
    });
    expect(slots.get("gold-1")).toMatchObject({
      sponsor: {
        imageOutpoint: IMAGE,
        name: "Acme",
        origin: ORIGIN,
        url: "https://example.com/",
      },
      status: "sponsored",
    });
  });

  test("rejects spoofed placement and fails closed when services fail", async () => {
    const spoofed = await resolveSponsorSlots({
      configuredSlots: new Map([["gold-1", ORIGIN]]),
      services: services({
        map: {
          app: "bitplan",
          subType: "bitplanSponsorSlot",
          subTypeData: JSON.stringify({
            schema: 1,
            slot: "diamond-1",
            tier: "diamond",
          }),
          type: "ord",
        },
      }),
    });
    expect(spoofed.get("gold-1")?.status).toBe("paused");

    const unavailable = await resolveSponsorSlots({
      configuredSlots: new Map([["gold-1", ORIGIN]]),
      services: {
        market: {
          getListingsByOrigins: () => Promise.reject(new Error("market down")),
        },
        ordfs: {
          bulkMetadata: () => Promise.reject(new Error("ordfs down")),
        },
      },
    });
    expect(unavailable.get("gold-1")?.status).toBe("paused");
  });
});
