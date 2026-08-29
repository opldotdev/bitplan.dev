import { describe, expect, test } from "bun:test";

import {
  quoteSponsorSlot,
  sponsorPaymentMatchesQuote,
  sponsorSatsForUsd,
} from "./sponsor-quote";

describe("sponsor quotes", () => {
  test("converts fixed USD inventory to satoshis", async () => {
    expect(sponsorSatsForUsd(50, 20)).toBe(250_000_000);
    const quote = await quoteSponsorSlot("silver-1", () =>
      Promise.resolve(Response.json({ currency: "USD", rate: "20" }))
    );
    expect(quote).toEqual({
      bsvUsd: 20,
      priceSats: 1_250_000,
      priceUsd: 0.25,
      slotId: "silver-1",
    });
  });

  test("allows small quote movement but rejects a stale price", () => {
    expect(sponsorPaymentMatchesQuote(101, 100)).toBe(true);
    expect(sponsorPaymentMatchesQuote(103, 100)).toBe(false);
  });
});
