import { describe, expect, test } from "bun:test";

import { BITPLAN_TYPE_TAG, walletOwnsDraft } from "./drafts";

const ORIGIN = `${"a".repeat(64)}_0`;
const LATEST = `${"b".repeat(64)}_1`;

function walletWith(outputs: { outpoint: string; tags?: string[] }[]) {
  return {
    listOutputs() {
      return Promise.resolve({ outputs });
    },
  };
}

describe("walletOwnsDraft", () => {
  test("requires the latest plan coin, not decrypt access", async () => {
    const owner = walletWith([
      {
        outpoint: LATEST.replace("_", "."),
        tags: [BITPLAN_TYPE_TAG, `origin:${ORIGIN}`],
      },
    ]);
    const reader = walletWith([]);

    expect(await walletOwnsDraft(owner, ORIGIN, LATEST)).toBe(true);
    expect(await walletOwnsDraft(reader, ORIGIN, LATEST)).toBe(false);
  });

  test("rejects a stale coin from the same origin", async () => {
    const stale = walletWith([
      {
        outpoint: `${"c".repeat(64)}.1`,
        tags: [BITPLAN_TYPE_TAG, `origin:${ORIGIN}`],
      },
    ]);

    expect(await walletOwnsDraft(stale, ORIGIN, LATEST)).toBe(false);
  });
});
