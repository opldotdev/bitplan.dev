import { describe, expect, test } from "bun:test";

import { transitionedDraftHref } from "./hosted-draft-redirect";

describe("hosted draft transition", () => {
  test("keeps a reader-link fragment when moving to the chain origin", () => {
    expect(transitionedDraftHref("chain_0", "#k=reader-secret")).toBe(
      "/d/chain_0#k=reader-secret"
    );
    expect(transitionedDraftHref("chain_0", "")).toBe("/d/chain_0");
  });
});
