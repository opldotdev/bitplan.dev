import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SponsorSlot } from "./sponsor-slot";

describe("SponsorSlot", () => {
  test("renders an unavailable slot with no payment interaction", () => {
    const markup = renderToStaticMarkup(
      <SponsorSlot
        slotClassName="min-h-12"
        slotId="silver-1"
        tierName="Silver"
      />
    );

    expect(markup).toContain("disabled");
    expect(markup).toContain("Coming soon");
    expect(markup).toContain("sponsorships are not yet available");
  });
});
