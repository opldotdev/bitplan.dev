import { describe, expect, mock, test } from "bun:test";
import { buildInscriptionScript } from "@1sat/templates";
import { P2PKH, PrivateKey, Transaction } from "@bsv/sdk";

import {
  finalizeSponsorReceipt,
  TerminalSponsorRelayError,
} from "./sponsor-finalize";
import {
  InvalidSponsorReceiptError,
  validateSponsorReceipt,
} from "./sponsor-receipt";
import { SponsorSlotClaimedError } from "./sponsor-storage";
import {
  SPONSOR_APP,
  SPONSOR_CONTENT_TYPE,
  SPONSOR_PAYMENT_ADDRESS,
  SPONSOR_TIERS,
  sponsorPriceSats,
  sponsorSubtype,
} from "./sponsors";

function webp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46, 22, 0, 0, 0], 0); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x20, 10, 0, 0, 0], 12); // VP8
  bytes.set([0, 0, 0, 0x9d, 0x01, 0x2a], 20);
  bytes[26] = width % 256;
  bytes[27] = Math.floor(width / 256);
  bytes[28] = height % 256;
  bytes[29] = Math.floor(height / 256);
  return bytes;
}

function receiptBeef({
  payment,
  slotId = "silver-1",
}: {
  payment?: number;
  slotId?: string;
} = {}): Uint8Array {
  const tier = SPONSOR_TIERS.find(({ id }) => id === "silver");
  if (!tier) {
    throw new Error("Missing silver tier.");
  }
  const owner = PrivateKey.fromRandom().toPublicKey().toAddress();
  const transaction = new Transaction();
  transaction.addOutput({
    lockingScript: buildInscriptionScript(
      new P2PKH().lock(owner),
      webp(tier.imageWidth, tier.imageHeight),
      SPONSOR_CONTENT_TYPE,
      {
        app: SPONSOR_APP,
        name: "Acme",
        subType: sponsorSubtype(slotId),
        subTypeData: JSON.stringify({
          href: "https://example.com/",
          schema: 1,
          slot: slotId,
          tier: tier.id,
        }),
        type: "ord",
      }
    ),
    satoshis: 1,
  });
  transaction.addOutput({
    lockingScript: new P2PKH().lock(SPONSOR_PAYMENT_ADDRESS),
    satoshis: payment ?? sponsorPriceSats(slotId, tier),
  });
  return Uint8Array.from(transaction.toAtomicBEEF());
}

describe("validateSponsorReceipt", () => {
  test("accepts one exact image, MAP record, and payment", () => {
    const receipt = validateSponsorReceipt(receiptBeef(), "silver-1");

    expect(receipt).toMatchObject({
      href: "https://example.com/",
      imageHeight: 128,
      imageWidth: 384,
      name: "Acme",
      slotId: "silver-1",
      tierId: "silver",
    });
    expect(receipt.imageOutpoint).toBe(`${receipt.txid}_0`);
  });

  test("rejects a payment with the wrong amount", () => {
    expect(() =>
      validateSponsorReceipt(receiptBeef({ payment: 1 }), "silver-1")
    ).toThrow(InvalidSponsorReceiptError);
  });

  test("rejects metadata for a different fixed slot", () => {
    expect(() =>
      validateSponsorReceipt(
        receiptBeef({ payment: 1_000_000, slotId: "silver-2" }),
        "silver-1"
      )
    ).toThrow("metadata does not match");
  });
});

describe("finalizeSponsorReceipt", () => {
  test("claims before relaying and reports relay success", async () => {
    const order: string[] = [];
    const result = await finalizeSponsorReceipt("silver-1", receiptBeef(), {
      claim: mock(() => {
        order.push("claim");
        return Promise.resolve("etag");
      }),
      read: () => Promise.resolve(null),
      relay: mock(() => {
        order.push("relay");
        return Promise.resolve();
      }),
      release: () => Promise.resolve(),
    });

    expect(order).toEqual(["claim", "relay"]);
    expect(result.relayed).toBe(true);
  });

  test("does not relay when another receipt won", async () => {
    const relay = mock(() => Promise.resolve());

    await expect(
      finalizeSponsorReceipt("silver-1", receiptBeef(), {
        claim: () => Promise.reject(new SponsorSlotClaimedError("silver-1")),
        read: () => Promise.resolve(null),
        relay,
        release: () => Promise.resolve(),
      })
    ).rejects.toBeInstanceOf(SponsorSlotClaimedError);
    expect(relay).not.toHaveBeenCalled();
  });

  test("keeps the winning receipt when relay needs a retry", async () => {
    const result = await finalizeSponsorReceipt("silver-1", receiptBeef(), {
      claim: () => Promise.resolve("etag"),
      read: () => Promise.resolve(null),
      relay: () => Promise.reject(new Error("ARC unavailable")),
      release: () => Promise.resolve(),
    });

    expect(result.relayed).toBe(false);
  });

  test("retries relay for the same stored BEEF", async () => {
    const beef = receiptBeef();
    const relay = mock(() => Promise.resolve());
    const result = await finalizeSponsorReceipt("silver-1", beef, {
      claim: () => Promise.reject(new SponsorSlotClaimedError("silver-1")),
      read: () => Promise.resolve({ beef, etag: "etag" }),
      relay,
      release: () => Promise.resolve(),
    });

    expect(relay).toHaveBeenCalledTimes(1);
    expect(result.relayed).toBe(true);
  });

  test("releases a terminally rejected receipt", async () => {
    const release = mock(() => Promise.resolve());

    await expect(
      finalizeSponsorReceipt("silver-1", receiptBeef(), {
        claim: () => Promise.resolve("winner-etag"),
        read: () => Promise.resolve(null),
        relay: () =>
          Promise.reject(new TerminalSponsorRelayError("Double spend")),
        release,
      })
    ).rejects.toBeInstanceOf(TerminalSponsorRelayError);
    expect(release).toHaveBeenCalledWith("silver-1", "winner-etag");
  });
});
