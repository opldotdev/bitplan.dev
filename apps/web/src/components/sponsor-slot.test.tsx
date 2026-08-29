import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const { SponsorSlot } = await import("./sponsor-slot");

const tier = {
  gridClassName: "grid-cols-3 sm:grid-cols-6",
  id: "silver" as const,
  imageHeight: 128,
  imageWidth: 384,
  name: "Silver",
  priceSats: 300_000_000,
  priceUsd: 50,
  slotClassName: "aspect-[384/128]",
  slotIds: ["silver-1"],
};

describe("SponsorSlot", () => {
  test("renders an available slot with payment interaction", () => {
    const markup = renderToStaticMarkup(
      <SponsorSlot
        slot={{ slotId: "silver-1", status: "available" }}
        slotId="silver-1"
        tier={tier}
      />
    );

    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain("Test slot · 0.01 BSV");
    expect(markup).toContain("cursor-pointer");
  });

  test("renders an on-chain sponsor as a sponsored link", () => {
    const markup = renderToStaticMarkup(
      <SponsorSlot
        slot={{
          slotId: "silver-1",
          sponsor: {
            name: "Acme",
            slotId: "silver-1",
            txid: "b".repeat(64),
            url: "https://example.com",
          },
          status: "sponsored",
        }}
        slotId="silver-1"
        tier={tier}
      />
    );

    expect(markup).toContain("Acme logo");
    expect(markup).toContain('rel="sponsored noopener noreferrer"');
    expect(markup).toContain("/api/sponsors/silver-1/image");
  });
});
