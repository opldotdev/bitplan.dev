import { describe, expect, mock, test } from "bun:test";
import { P2PKH, type WalletInterface } from "@bsv/sdk";

import {
  createSponsorCheckout,
  sponsorWalletErrorMessage,
} from "./sponsor-checkout";
import {
  SPONSOR_PAYMENT_ADDRESS,
  SPONSOR_TIERS,
  sponsorSubtype,
} from "./sponsors";

describe("createSponsorCheckout", () => {
  test("builds one unbroadcast image and payment transaction", async () => {
    const createAction = mock(() =>
      Promise.resolve({ tx: [1, 2, 3], txid: "a".repeat(64) })
    );
    const wallet = {
      createAction,
      getPublicKey: () =>
        Promise.resolve({
          publicKey:
            "03d90d0c79bb43117a1d2f94e64986d921d825c73f32db6b2460232dc7a72875c4",
        }),
    } as unknown as WalletInterface;
    const tier = SPONSOR_TIERS.find(({ id }) => id === "silver");
    if (!tier) {
      throw new Error("Missing test tier.");
    }

    const result = await createSponsorCheckout({
      image: new Uint8Array([1, 2, 3]),
      name: "Acme",
      quote: {
        bsvUsd: 20,
        priceSats: 1_250_000,
        priceUsd: 0.25,
        slotId: "silver-1",
      },
      slotId: "silver-1",
      tier,
      url: "https://example.com/",
      wallet,
    });

    expect(result.txid).toBe("a".repeat(64));
    expect(createAction).toHaveBeenCalledTimes(1);
    const request = createAction.mock.calls[0]?.[0];
    expect(request?.options).toMatchObject({
      noSend: true,
      randomizeOutputs: false,
    });
    expect(request?.outputs?.map(({ satoshis }) => satoshis)).toEqual([
      1, 1_250_000,
    ]);

    const imageOutput = request?.outputs?.[0];
    const paymentOutput = request?.outputs?.[1];
    expect(imageOutput?.lockingScript).toContain(
      Buffer.from(sponsorSubtype("silver-1")).toString("hex")
    );
    expect(paymentOutput?.lockingScript).toBe(
      new P2PKH().lock(SPONSOR_PAYMENT_ADDRESS).toHex()
    );
  });

  test("turns a serialized wallet denial into safe copy", () => {
    const error = new Error(
      JSON.stringify({
        args: { lockingScript: "deadbeef" },
        call: "createAction",
        message: "Permission denied.",
      })
    );
    const message = sponsorWalletErrorMessage(error);
    expect(message).toBe(
      "The wallet declined the transaction. Nothing was published or paid."
    );
    expect(message).not.toContain("lockingScript");
  });
});
