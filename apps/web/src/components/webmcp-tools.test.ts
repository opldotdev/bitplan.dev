import { describe, expect, test } from "bun:test";

import type { DraftsWallet } from "@/lib/drafts";

import { bitplanViewerUrl, listConnectedBitplans } from "./webmcp-tools";

const ORIGIN = `${"a".repeat(64)}_0`;

describe("WebMCP wallet tools", () => {
  test("lists links without decrypting plan contents", async () => {
    let decryptCalled = false;
    const wallet = {
      decrypt() {
        decryptCalled = true;
        throw new Error("must not decrypt");
      },
      getPublicKey() {
        throw new Error("must not request a key");
      },
      listOutputs() {
        return Promise.resolve({
          outputs: [
            {
              outpoint: ORIGIN.replace("_", "."),
              tags: ["type:application/x-bitplan", "origin"],
            },
          ],
        });
      },
    } as DraftsWallet;

    expect(await listConnectedBitplans(wallet, "https://bitplan.dev")).toEqual({
      count: 1,
      plans: [
        {
          origin: ORIGIN,
          outpoint: ORIGIN,
          url: `https://bitplan.dev/d/${ORIGIN}`,
        },
      ],
      status: "ok",
    });
    expect(decryptCalled).toBe(false);
  });

  test("requires a wallet that the user already connected", async () => {
    expect(await listConnectedBitplans(null, "https://bitplan.dev")).toEqual({
      connectUrl: "https://bitplan.dev/drafts",
      message: "Open My drafts and connect your wallet first.",
      status: "wallet-not-connected",
    });
  });

  test("opens only normalized BitPlan origins", () => {
    expect(
      bitplanViewerUrl(
        { origin: ORIGIN.replace("_", ".") },
        "https://bitplan.dev"
      )
    ).toBe(`https://bitplan.dev/d/${ORIGIN}`);
    expect(() =>
      bitplanViewerUrl({ origin: "not-an-outpoint" }, "https://bitplan.dev")
    ).toThrow("Enter a valid BitPlan origin outpoint.");
  });
});
