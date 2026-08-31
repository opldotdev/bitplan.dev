import { describe, expect, test } from "bun:test";

import { walletIdentityKey } from "@/components/drafts-list";

describe("wallet identity", () => {
  test("returns the connected wallet's normalized public identity", async () => {
    const publicKey =
      "02C6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5";
    const wallet = {
      getPublicKey: async () => ({ publicKey }),
    };

    expect(await walletIdentityKey(wallet)).toBe(publicKey.toLowerCase());
  });
});
