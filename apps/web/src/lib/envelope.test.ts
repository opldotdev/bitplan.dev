import { describe, expect, test } from "bun:test";
import { PrivateKey, ProtoWallet } from "@bsv/sdk";

import {
  type DraftPlaintext,
  ENVELOPE_WIRE_VERSION,
  EnvelopeAccessError,
  EnvelopeError,
  type EnvelopeHeader,
  type EnvelopeWallet,
  frameEnvelope,
  MAGIC,
  openEnvelope,
  parseEnvelope,
  sealEnvelope,
  sharedWith,
} from "./envelope";

const BAD_WRAP_MODE = /key mode/;
const NO_KEY_ID = /keyID is missing/;
const BAD_MAGIC = /magic/;
const BAD_VERSION = /version 0x03/;
const TOO_SHORT = /too short/;
const TRUNCATED = /Truncated/;
const NO_CIPHERTEXT = /no ciphertext/;
const NOT_JSON = /not valid JSON/;
const TAMPERED = /failed authentication/;
const WRONG_PROTOCOL = /must be \[2, bitplan\]/;
const INVALID_CURVE_POINT = /secp256k1 point/;
const NONCONTIGUOUS = /not contiguous/;
const UNSUPPORTED_0X01 =
  "Unsupported bitplan envelope version 0x01; this viewer reads envelope version 0x02.";

const SENDER_IDENTITY =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

const PAD = Uint8Array.from(
  Array.from({ length: 32 }, (_, i) => ((i * 37 + 11) % 251) + 1)
);

function xorPad(bytes: number[]): number[] {
  // biome-ignore lint/suspicious/noBitwiseOperators: XOR pad makes the mock wallet a real involution
  return bytes.map((byte, i) => byte ^ (PAD[i % PAD.length] ?? 0));
}

function createMockWallet(identityKey = SENDER_IDENTITY): {
  calls: {
    decrypt: Array<{
      counterparty?: string;
      keyID: string;
      protocolID: unknown;
    }>;
    encrypt: Array<{
      counterparty?: string;
      keyID: string;
      plaintextLength: number;
      protocolID: unknown;
    }>;
  };
  wallet: EnvelopeWallet & {
    encrypt: (args: {
      counterparty?: string;
      keyID: string;
      plaintext: number[];
      protocolID: unknown;
    }) => Promise<{ ciphertext: number[] }>;
  };
} {
  const calls = {
    decrypt: [] as Array<{
      counterparty?: string;
      keyID: string;
      protocolID: unknown;
    }>,
    encrypt: [] as Array<{
      counterparty?: string;
      keyID: string;
      plaintextLength: number;
      protocolID: unknown;
    }>,
  };

  const wallet: EnvelopeWallet & {
    encrypt: (args: {
      counterparty?: string;
      keyID: string;
      plaintext: number[];
      protocolID: unknown;
    }) => Promise<{ ciphertext: number[] }>;
  } = {
    decrypt(args) {
      calls.decrypt.push({
        counterparty: args.counterparty,
        keyID: args.keyID,
        protocolID: args.protocolID,
      });
      return Promise.resolve({ plaintext: xorPad(args.ciphertext) });
    },
    encrypt(args) {
      calls.encrypt.push({
        counterparty: args.counterparty,
        keyID: args.keyID,
        plaintextLength: args.plaintext.length,
        protocolID: args.protocolID,
      });
      return Promise.resolve({ ciphertext: xorPad(args.plaintext) });
    },
    getPublicKey() {
      return Promise.resolve({
        publicKey: identityKey,
      });
    },
  };

  return { calls, wallet };
}

const PLAINTEXT: DraftPlaintext = {
  html: "<!doctype html><title>Migration plan</title><p>hello</p>",
  meta: {
    cliVersion: "0.0.1",
    createdAt: "2026-01-01T00:00:00.000Z",
    description: "phase one",
    fileSha256: "b".repeat(64),
    gitBranch: "master",
    gitCommitSha: "a".repeat(40),
    gitCommitSubject: "feat: something",
    gitDirty: false,
    repoHost: "github.com",
    repoName: "bitplan.dev",
    repoOrg: "b-open-io",
    title: "Migration plan",
  },
};

function validHeader(): EnvelopeHeader {
  return {
    key: {
      keyID: "key-1",
      mode: "brc2-multi",
      payloadLength: 48,
      protocolID: [2, "bitplan"],
      senderIdentityKey: SENDER_IDENTITY,
      slots: [{ identityKey: SENDER_IDENTITY, length: 1, offset: 48 }],
    },
    v: 2,
  };
}

function validBody(): Uint8Array {
  return new Uint8Array(49);
}

describe("envelope round trip", () => {
  test("seals a publisher-only envelope as wire 0x02 with one self slot", async () => {
    const { calls, wallet } = createMockWallet();
    const envelope = await sealEnvelope(wallet, PLAINTEXT, "key-1");
    const parsed = parseEnvelope(envelope);
    const opened = await openEnvelope(wallet, envelope);

    expect(envelope[MAGIC.length]).toBe(0x02);
    expect(parsed.header.v).toBe(2);
    expect(parsed.header.key.mode).toBe("brc2-multi");
    expect(parsed.header.key.slots).toHaveLength(1);
    expect(parsed.header.key.slots[0]?.identityKey).toBe(SENDER_IDENTITY);
    expect(parsed.header.key.senderIdentityKey).toBe(SENDER_IDENTITY);
    expect(sharedWith(parsed.header)).toEqual([]);
    expect(opened.plaintext).toEqual(PLAINTEXT);
    expect(opened.header.key.keyID).toBe("key-1");
    expect(calls.encrypt).toHaveLength(1);
    expect(calls.encrypt[0]?.counterparty).toBe("self");
    expect(calls.encrypt[0]?.plaintextLength).toBe(32);
    expect(calls.encrypt[0]?.protocolID).toEqual([2, "bitplan"]);
    expect(calls.encrypt[0]?.keyID).toBe("key-1");
    expect(calls.decrypt).toHaveLength(1);
  });

  test("wraps the 32-byte document key, not the whole document", async () => {
    const { calls, wallet } = createMockWallet();
    const envelope = await sealEnvelope(wallet, PLAINTEXT, "key-1");
    const { ciphertext, header } = parseEnvelope(envelope);
    const body = Array.from(
      new TextEncoder().encode(JSON.stringify(PLAINTEXT))
    );

    expect(ciphertext.length).toBeGreaterThan(body.length);
    expect(header.key.payloadLength).toBeLessThan(ciphertext.length);
    expect(calls.encrypt[0]?.plaintextLength).toBe(32);
    expect(calls.encrypt[0]?.counterparty).toBe("self");
  });

  test("a tampered ciphertext does not round-trip as the document", async () => {
    const { wallet } = createMockWallet();
    const envelope = await sealEnvelope(wallet, PLAINTEXT, "key-1");
    const last = envelope.length - 1;
    // biome-ignore lint/suspicious/noBitwiseOperators: flip bits to corrupt the body
    envelope[last] = (envelope[last] ?? 0) ^ 0xff;

    await expect(openEnvelope(wallet, envelope)).rejects.toThrow(TAMPERED);
  });

  test("reads the protocolID out of the header", async () => {
    const { calls, wallet } = createMockWallet();
    const envelope = await sealEnvelope(wallet, PLAINTEXT, "key-1");
    await openEnvelope(wallet, envelope);
    expect(calls.decrypt[0]?.protocolID).toEqual([2, "bitplan"]);
  });

  test("opens a recipient slot and rejects a third wallet", async () => {
    const owner = new ProtoWallet(new PrivateKey(1));
    const recipient = new ProtoWallet(new PrivateKey(2));
    const recipientIdentity = (
      await recipient.getPublicKey({ identityKey: true })
    ).publicKey;
    const ownerIdentity = (await owner.getPublicKey({ identityKey: true }))
      .publicKey;
    const envelope = await sealEnvelope(owner, PLAINTEXT, "shared-key", [
      recipientIdentity,
    ]);

    const parsed = parseEnvelope(envelope);
    expect(envelope[MAGIC.length]).toBe(0x02);
    expect(parsed.header.key.slots).toHaveLength(2);
    expect(parsed.header.key.slots[0]?.identityKey).toBe(ownerIdentity);
    expect(sharedWith(parsed.header)).toEqual([recipientIdentity]);
    expect((await openEnvelope(owner, envelope)).plaintext).toEqual(PLAINTEXT);
    let recipientCounterparty: string | undefined;
    const recipientWallet: EnvelopeWallet = {
      decrypt: (args) => {
        recipientCounterparty = args.counterparty;
        return recipient.decrypt(args);
      },
      getPublicKey: (args) => recipient.getPublicKey(args),
    };
    expect((await openEnvelope(recipientWallet, envelope)).plaintext).toEqual(
      PLAINTEXT
    );
    expect(recipientCounterparty).toBe(ownerIdentity);

    const outsider = new ProtoWallet(new PrivateKey(3));
    try {
      await openEnvelope(outsider, envelope);
      throw new Error("expected outsider rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvelopeAccessError);
      expect((error as EnvelopeAccessError).issue).toBe("not-authorized");
    }
  });
});

describe("envelope header parsing", () => {
  test("rejects bad magic", () => {
    const envelope = frameEnvelope(validHeader(), validBody());
    // biome-ignore lint/suspicious/noBitwiseOperators: derive a byte that is definitely not the magic
    envelope[0] = 0x42 ^ 0xff;
    expect(() => parseEnvelope(envelope)).toThrow(EnvelopeError);
    expect(() => parseEnvelope(envelope)).toThrow(BAD_MAGIC);
  });

  test("rejects an unknown version byte", () => {
    const envelope = frameEnvelope(validHeader(), validBody());
    envelope[4] = 0x03;
    expect(() => parseEnvelope(envelope)).toThrow(BAD_VERSION);
  });

  test("rejects a 0x01 frame", () => {
    const envelope = frameEnvelope(validHeader(), validBody());
    envelope[4] = 0x01;
    expect(() => parseEnvelope(envelope)).toThrow(UNSUPPORTED_0X01);
  });

  test("rejects a buffer too short to hold a header", () => {
    expect(() => parseEnvelope(new Uint8Array([0x42, 0x50, 0x4c]))).toThrow(
      TOO_SHORT
    );
  });

  test("rejects a truncated header", () => {
    const envelope = frameEnvelope(validHeader(), validBody());
    const truncated = envelope.subarray(0, 20);
    expect(() => parseEnvelope(truncated)).toThrow(TRUNCATED);
  });

  test("rejects a header with no ciphertext behind it", () => {
    const envelope = frameEnvelope(validHeader(), new Uint8Array([]));
    expect(() => parseEnvelope(envelope)).toThrow(NO_CIPHERTEXT);
  });

  test("rejects a header that is not JSON", () => {
    const body = new TextEncoder().encode("not json at all");
    const out = new Uint8Array(9 + body.length + 3);
    out.set(MAGIC, 0);
    out[4] = ENVELOPE_WIRE_VERSION;
    new DataView(out.buffer).setUint32(5, body.length, true);
    out.set(body, 9);
    out.set([1, 2, 3], 9 + body.length);
    expect(() => parseEnvelope(out)).toThrow(NOT_JSON);
  });

  test("rejects an unknown key mode", () => {
    const header = validHeader();
    const envelope = frameEnvelope(
      { ...header, key: { ...header.key, mode: "plaintext" } } as never,
      validBody()
    );
    expect(() => parseEnvelope(envelope)).toThrow(BAD_WRAP_MODE);
  });

  test("rejects a header with no keyID", () => {
    const header = validHeader();
    const envelope = frameEnvelope(
      { ...header, key: { ...header.key, keyID: "" } },
      validBody()
    );
    expect(() => parseEnvelope(envelope)).toThrow(NO_KEY_ID);
  });

  test("rejects another wallet protocol before decryption", () => {
    const header = validHeader();
    const envelope = frameEnvelope(
      { ...header, key: { ...header.key, protocolID: [2, "other"] } },
      validBody()
    );
    expect(() => parseEnvelope(envelope)).toThrow(WRONG_PROTOCOL);
  });

  test("rejects malformed shared identities and slot coverage", () => {
    const header: EnvelopeHeader = {
      key: {
        keyID: "shared-key",
        mode: "brc2-multi",
        payloadLength: 48,
        protocolID: [2, "bitplan"],
        senderIdentityKey: SENDER_IDENTITY,
        slots: [{ identityKey: SENDER_IDENTITY, length: 1, offset: 48 }],
      },
      v: 2,
    };
    const body = new Uint8Array(49);
    expect(() => parseEnvelope(frameEnvelope(header, body))).not.toThrow();

    const invalidIdentity = structuredClone(header);
    invalidIdentity.key.senderIdentityKey = `02${"f".repeat(64)}`;
    const [invalidSlot] = invalidIdentity.key.slots;
    if (!invalidSlot) {
      throw new Error("expected shared slot");
    }
    invalidSlot.identityKey = `02${"f".repeat(64)}`;
    expect(() => parseEnvelope(frameEnvelope(invalidIdentity, body))).toThrow(
      INVALID_CURVE_POINT
    );

    const gap = structuredClone(header);
    const [gapSlot] = gap.key.slots;
    if (!gapSlot) {
      throw new Error("expected shared slot");
    }
    gapSlot.offset = 49;
    expect(() => parseEnvelope(frameEnvelope(gap, body))).toThrow(
      NONCONTIGUOUS
    );
  });
});
