import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SponsorSlot } from "./sponsor-slot";

const tier = {
  gridClassName: "grid-cols-3 sm:grid-cols-6",
  id: "silver" as const,
  imageHeight: 128,
  imageWidth: 384,
  name: "Silver",
  priceUsd: 50,
  slotClassName: "aspect-[384/128]",
  slotIds: ["silver-1"],
};

describe("SponsorSlot", () => {
  test("renders an unavailable slot with no payment interaction", () => {
    const markup = renderToStaticMarkup(
      <SponsorSlot slotId="silver-1" tier={tier} />
    );

    expect(markup).toContain("disabled");
    expect(markup).toContain("Unavailable");
    expect(markup).toContain("sponsorship is unavailable");
  });

  test("renders an on-chain sponsor as a sponsored link", () => {
    const markup = renderToStaticMarkup(
      <SponsorSlot
        slot={{
          origin: `${"a".repeat(64)}_0`,
          slotId: "silver-1",
          sponsor: {
            imageOutpoint: `${"b".repeat(64)}_0`,
            name: "Acme",
            origin: `${"a".repeat(64)}_0`,
            slotId: "silver-1",
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
    expect(markup).toContain("/1sat/ordfs/image/");
  });
});
