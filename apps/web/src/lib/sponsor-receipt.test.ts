import { describe, expect, mock, test } from "bun:test";
import { buildInscriptionScript } from "@1sat/templates";
import { P2PKH, PrivateKey, Transaction } from "@bsv/sdk";

import { SponsorAlreadyListedError } from "./sponsor-duplicates";
import {
  finalizeSponsorLinkReceipt,
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
  SPONSOR_LINK_SLOT_ID,
  SPONSOR_LINK_TIER,
  SPONSOR_PAYMENT_ADDRESS,
  SPONSOR_TIERS,
  sponsorPriceUsd,
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
  quotedPrice,
  slotId = "silver-1",
}: {
  payment?: number;
  quotedPrice?: number;
  slotId?: string;
} = {}): Uint8Array {
  const tier = SPONSOR_TIERS.find(({ id }) => id === "silver");
  if (!tier) {
    throw new Error("Missing silver tier.");
  }
  const owner = PrivateKey.fromRandom().toPublicKey().toAddress();
  const priceSats =
    quotedPrice ?? (slotId === "silver-1" ? 1_250_000 : 250_000_000);
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
          priceSats,
          priceUsd: sponsorPriceUsd(slotId, tier),
          schema: 2,
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
    satoshis: payment ?? priceSats,
  });
  return Uint8Array.from(transaction.toAtomicBEEF());
}

function linkReceiptBeef({
  blurb,
  payment,
  priceSats = 50_000_000,
}: {
  blurb?: string;
  payment?: number;
  priceSats?: number;
} = {}): Uint8Array {
  const owner = PrivateKey.fromRandom().toPublicKey().toAddress();
  const transaction = new Transaction();
  transaction.addOutput({
    lockingScript: buildInscriptionScript(
      new P2PKH().lock(owner),
      webp(SPONSOR_LINK_TIER.imageWidth, SPONSOR_LINK_TIER.imageHeight),
      SPONSOR_CONTENT_TYPE,
      {
        app: SPONSOR_APP,
        name: "Acme",
        subType: sponsorSubtype(SPONSOR_LINK_SLOT_ID),
        subTypeData: JSON.stringify({
          ...(blurb === undefined ? {} : { blurb }),
          href: "https://example.com/",
          priceSats,
          priceUsd: SPONSOR_LINK_TIER.priceUsd,
          schema: 2,
          slot: SPONSOR_LINK_SLOT_ID,
          tier: SPONSOR_LINK_TIER.id,
        }),
        type: "ord",
      }
    ),
    satoshis: 1,
  });
  transaction.addOutput({
    lockingScript: new P2PKH().lock(SPONSOR_PAYMENT_ADDRESS),
    satoshis: payment ?? priceSats,
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
      priceSats: 1_250_000,
      priceUsd: 0.25,
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
      validateSponsorReceipt(receiptBeef({ slotId: "silver-2" }), "silver-1")
    ).toThrow("metadata does not match");
  });

  test("accepts a link receipt with an optional blurb", () => {
    const receipt = validateSponsorReceipt(
      linkReceiptBeef({ blurb: "Encrypted plans on Bitcoin" }),
      SPONSOR_LINK_SLOT_ID
    );
    expect(receipt).toMatchObject({
      blurb: "Encrypted plans on Bitcoin",
      name: "Acme",
      priceUsd: 10,
      slotId: "link",
      tierId: "link",
    });
    expect(
      validateSponsorReceipt(linkReceiptBeef(), SPONSOR_LINK_SLOT_ID).blurb
    ).toBeUndefined();
  });

  test("rejects an invalid link blurb", () => {
    expect(() =>
      validateSponsorReceipt(
        linkReceiptBeef({ blurb: " leading space" }),
        SPONSOR_LINK_SLOT_ID
      )
    ).toThrow("blurb");
    expect(() =>
      validateSponsorReceipt(
        linkReceiptBeef({ blurb: "x".repeat(81) }),
        SPONSOR_LINK_SLOT_ID
      )
    ).toThrow("blurb");
  });

  test("rejects a blurb on a fixed image slot", () => {
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
          subType: sponsorSubtype("silver-1"),
          subTypeData: JSON.stringify({
            blurb: "not allowed here",
            href: "https://example.com/",
            priceSats: 1_250_000,
            priceUsd: sponsorPriceUsd("silver-1", tier),
            schema: 2,
            slot: "silver-1",
            tier: tier.id,
          }),
          type: "ord",
        }
      ),
      satoshis: 1,
    });
    transaction.addOutput({
      lockingScript: new P2PKH().lock(SPONSOR_PAYMENT_ADDRESS),
      satoshis: 1_250_000,
    });
    expect(() =>
      validateSponsorReceipt(
        Uint8Array.from(transaction.toAtomicBEEF()),
        "silver-1"
      )
    ).toThrow(InvalidSponsorReceiptError);
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

  test("rejects a stale BSV quote before claiming the slot", async () => {
    const claim = mock(() => Promise.resolve("etag"));

    await expect(
      finalizeSponsorReceipt("silver-1", receiptBeef(), {
        claim,
        quote: () =>
          Promise.resolve({
            bsvUsd: 12.5,
            priceSats: 2_000_000,
            priceUsd: 0.25,
            slotId: "silver-1",
          }),
        read: () => Promise.resolve(null),
        relay: () => Promise.resolve(),
        release: () => Promise.resolve(),
      })
    ).rejects.toThrow("BSV quote changed");
    expect(claim).not.toHaveBeenCalled();
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

  test("rejects a duplicate sponsor before claiming the slot", async () => {
    const claim = mock(() => Promise.resolve("etag"));

    await expect(
      finalizeSponsorReceipt("silver-1", receiptBeef(), {
        assertNotListed: () => Promise.reject(new SponsorAlreadyListedError()),
        claim,
        read: () => Promise.resolve(null),
        relay: () => Promise.resolve(),
        release: () => Promise.resolve(),
      })
    ).rejects.toBeInstanceOf(SponsorAlreadyListedError);
    expect(claim).not.toHaveBeenCalled();
  });
});

describe("finalizeSponsorLinkReceipt", () => {
  function linkDependencies(
    overrides: Partial<Parameters<typeof finalizeSponsorLinkReceipt>[1]> = {}
  ): NonNullable<Parameters<typeof finalizeSponsorLinkReceipt>[1]> {
    return {
      assertNotListed: () => Promise.resolve(),
      claim: () => Promise.resolve("etag"),
      publish: mock(() => Promise.resolve()),
      read: () => Promise.resolve(null),
      relay: () => Promise.resolve(),
      release: () => Promise.resolve(),
      ...overrides,
    };
  }

  test("claims, relays, and publishes the public link artifacts", async () => {
    const publish = mock(() => Promise.resolve());
    const result = await finalizeSponsorLinkReceipt(
      linkReceiptBeef({ blurb: "Encrypted plans" }),
      linkDependencies({ publish })
    );

    expect(result.relayed).toBe(true);
    expect(result.blurb).toBe("Encrypted plans");
    expect(publish).toHaveBeenCalledTimes(1);
  });

  test("rejects an already listed sponsor before claiming", async () => {
    const claim = mock(() => Promise.resolve("etag"));

    await expect(
      finalizeSponsorLinkReceipt(
        linkReceiptBeef(),
        linkDependencies({
          assertNotListed: () =>
            Promise.reject(new SponsorAlreadyListedError()),
          claim,
        })
      )
    ).rejects.toBeInstanceOf(SponsorAlreadyListedError);
    expect(claim).not.toHaveBeenCalled();
  });

  test("retries an identical stored link without re-checking duplicates", async () => {
    const beef = linkReceiptBeef();
    const assertNotListed = mock(() => Promise.resolve());
    const result = await finalizeSponsorLinkReceipt(
      beef,
      linkDependencies({
        assertNotListed,
        read: () => Promise.resolve({ beef, etag: "etag" }),
      })
    );

    expect(result.relayed).toBe(true);
    expect(assertNotListed).not.toHaveBeenCalled();
  });

  test("releases a terminally rejected link", async () => {
    const release = mock(() => Promise.resolve());
    const publish = mock(() => Promise.resolve());

    await expect(
      finalizeSponsorLinkReceipt(
        linkReceiptBeef(),
        linkDependencies({
          publish,
          relay: () =>
            Promise.reject(new TerminalSponsorRelayError("Double spend")),
          release,
        })
      )
    ).rejects.toBeInstanceOf(TerminalSponsorRelayError);
    expect(release).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });
});
