import { describe, expect, test } from "bun:test";

import {
  CONTENT_KEY_BYTES,
  type DraftPlaintext,
  ENVELOPE_VERSION,
  EnvelopeError,
  type EnvelopeHeader,
  type EnvelopeWallet,
  frameEnvelope,
  fromBase64,
  IV_BYTES,
  MAGIC,
  openEnvelope,
  parseEnvelope,
  toBase64,
} from "./envelope";

/**
 * XOR pad involution — ported from packages/cli/test/mockWallet.ts.
 * encrypt/decrypt are a real involution rather than the identity, so a
 * round-trip proves the wrap ran and transformed bytes.
 */
const PAD = Uint8Array.from(
  Array.from({ length: 32 }, (_, i) => ((i * 37 + 11) % 251) + 1)
);

function xorPad(bytes: number[]): number[] {
  return bytes.map((byte, i) => byte ^ (PAD[i % PAD.length] ?? 0));
}

function createMockWallet(): {
  wallet: EnvelopeWallet;
  calls: {
    decrypt: Array<{
      protocolID: unknown;
      keyID: string;
      counterparty?: string;
    }>;
    encrypt: Array<{
      protocolID: unknown;
      keyID: string;
      counterparty?: string;
    }>;
  };
} {
  const calls = {
    decrypt: [] as Array<{
      protocolID: unknown;
      keyID: string;
      counterparty?: string;
    }>,
    encrypt: [] as Array<{
      protocolID: unknown;
      keyID: string;
      counterparty?: string;
    }>,
  };

  const wallet: EnvelopeWallet & {
    encrypt: (args: {
      protocolID: unknown;
      keyID: string;
      counterparty?: string;
      plaintext: number[];
    }) => Promise<{ ciphertext: number[] }>;
  } = {
    async decrypt(args) {
      calls.decrypt.push({
        counterparty: args.counterparty,
        keyID: args.keyID,
        protocolID: args.protocolID,
      });
      return { plaintext: xorPad(args.ciphertext) };
    },
    async encrypt(args) {
      calls.encrypt.push({
        counterparty: args.counterparty,
        keyID: args.keyID,
        protocolID: args.protocolID,
      });
      return { ciphertext: xorPad(args.plaintext) };
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

/** In-test sealer: WebCrypto AES-GCM + mock-wallet wrap. Not shipped. */
async function sealEnvelope(
  wallet: {
    encrypt: (args: {
      protocolID: [number, string];
      keyID: string;
      counterparty: "self";
      plaintext: number[];
    }) => Promise<{ ciphertext: number[] }>;
  },
  plaintext: DraftPlaintext,
  keyID: string
): Promise<Uint8Array> {
  const contentKey = globalThis.crypto.getRandomValues(
    new Uint8Array(CONTENT_KEY_BYTES)
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const body = new TextEncoder().encode(JSON.stringify(plaintext));
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    contentKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const ciphertext = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      body
    )
  );
  const wrapped = await wallet.encrypt({
    counterparty: "self",
    keyID,
    plaintext: Array.from(contentKey),
    protocolID: [2, "bitplan"],
  });
  const header: EnvelopeHeader = {
    alg: "aes-256-gcm",
    iv: toBase64(iv),
    key: {
      ciphertext: toBase64(Uint8Array.from(wrapped.ciphertext)),
      keyID,
      mode: "brc2-self",
      protocolID: [2, "bitplan"],
    },
    v: 1,
  };
  return frameEnvelope(header, ciphertext);
}

function validHeader(): EnvelopeHeader {
  return {
    alg: "aes-256-gcm",
    iv: toBase64(new Uint8Array(IV_BYTES)),
    key: {
      ciphertext: toBase64(new Uint8Array(CONTENT_KEY_BYTES)),
      keyID: "key-1",
      mode: "brc2-self",
      protocolID: [2, "bitplan"],
    },
    v: 1,
  };
}

describe("envelope round trip", () => {
  test("seals and opens through a mock wallet involution", async () => {
    const { calls, wallet } = createMockWallet();
    const envelope = await sealEnvelope(wallet, PLAINTEXT, "key-1");
    const opened = await openEnvelope(wallet, envelope);

    expect(opened.plaintext).toEqual(PLAINTEXT);
    expect(opened.header.key.keyID).toBe("key-1");
    expect(calls.encrypt).toHaveLength(1);
    expect(calls.decrypt).toHaveLength(1);
  });

  test("wraps the content key through the wallet, not around it", async () => {
    const { calls, wallet } = createMockWallet();
    const envelope = await sealEnvelope(wallet, PLAINTEXT, "key-1");
    const { header } = parseEnvelope(envelope);

    const stored = fromBase64(header.key.ciphertext);
    expect(stored).toHaveLength(CONTENT_KEY_BYTES);

    const unwrapped = Uint8Array.from(xorPad(Array.from(stored)));
    expect(unwrapped).toHaveLength(CONTENT_KEY_BYTES);
    expect(Array.from(unwrapped)).not.toEqual(Array.from(stored));

    const wrapCall = calls.encrypt[0];
    expect(wrapCall?.counterparty).toBe("self");
    expect(wrapCall?.protocolID).toEqual([2, "bitplan"]);
    expect(wrapCall?.keyID).toBe("key-1");
  });

  test("a tampered ciphertext fails its authentication tag", async () => {
    const { wallet } = createMockWallet();
    const envelope = await sealEnvelope(wallet, PLAINTEXT, "key-1");
    const last = envelope.length - 1;
    envelope[last] = (envelope[last] ?? 0) ^ 0xff;

    await expect(openEnvelope(wallet, envelope)).rejects.toThrow(
      /failed its authentication tag/
    );
  });

  test("reads the protocolID out of the header", async () => {
    const { calls, wallet } = createMockWallet();
    const envelope = await sealEnvelope(wallet, PLAINTEXT, "key-1");
    await openEnvelope(wallet, envelope);
    expect(calls.decrypt[0]?.protocolID).toEqual([2, "bitplan"]);
  });
});

describe("envelope header parsing", () => {
  test("rejects bad magic", () => {
    const envelope = frameEnvelope(validHeader(), new Uint8Array([1, 2, 3]));
    envelope[0] = 0x42 ^ 0xff;
    expect(() => parseEnvelope(envelope)).toThrow(EnvelopeError);
    expect(() => parseEnvelope(envelope)).toThrow(/magic/);
  });

  test("rejects an unknown version byte", () => {
    const envelope = frameEnvelope(validHeader(), new Uint8Array([1, 2, 3]));
    envelope[4] = 0x02;
    expect(() => parseEnvelope(envelope)).toThrow(/version 0x02/);
  });

  test("rejects a buffer too short to hold a header", () => {
    expect(() => parseEnvelope(new Uint8Array([0x42, 0x50, 0x4c]))).toThrow(
      /too short/
    );
  });

  test("rejects a truncated header", () => {
    const envelope = frameEnvelope(validHeader(), new Uint8Array([1, 2, 3]));
    const truncated = envelope.subarray(0, 20);
    expect(() => parseEnvelope(truncated)).toThrow(/Truncated/);
  });

  test("rejects a header with no ciphertext behind it", () => {
    const envelope = frameEnvelope(validHeader(), new Uint8Array([]));
    expect(() => parseEnvelope(envelope)).toThrow(/no ciphertext/);
  });

  test("rejects a header that is not JSON", () => {
    const body = new TextEncoder().encode("not json at all");
    const out = new Uint8Array(9 + body.length + 3);
    out.set(MAGIC, 0);
    out[4] = ENVELOPE_VERSION;
    new DataView(out.buffer).setUint32(5, body.length, true);
    out.set(body, 9);
    out.set([1, 2, 3], 9 + body.length);
    expect(() => parseEnvelope(out)).toThrow(/not valid JSON/);
  });

  test("rejects an unsupported cipher", () => {
    const header = { ...validHeader(), alg: "aes-128-cbc" };
    const envelope = frameEnvelope(
      header as unknown as EnvelopeHeader,
      new Uint8Array([1, 2, 3])
    );
    expect(() => parseEnvelope(envelope)).toThrow(/Unsupported bitplan cipher/);
  });

  test("rejects a wrong-length iv", () => {
    const header = { ...validHeader(), iv: toBase64(new Uint8Array(8)) };
    const envelope = frameEnvelope(header, new Uint8Array([1, 2, 3]));
    expect(() => parseEnvelope(envelope)).toThrow(/iv must be 12/);
  });

  test("rejects an unknown key wrap mode", () => {
    const header = validHeader();
    const envelope = frameEnvelope(
      { ...header, key: { ...header.key, mode: "plaintext" } } as never,
      new Uint8Array([1, 2, 3])
    );
    expect(() => parseEnvelope(envelope)).toThrow(/key wrap mode/);
  });

  test("rejects a header with no keyID", () => {
    const header = validHeader();
    const envelope = frameEnvelope(
      { ...header, key: { ...header.key, keyID: "" } },
      new Uint8Array([1, 2, 3])
    );
    expect(() => parseEnvelope(envelope)).toThrow(/keyID is missing/);
  });
});
