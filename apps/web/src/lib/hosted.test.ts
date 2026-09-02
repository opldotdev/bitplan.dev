import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { Hash, Utils } from "@bsv/sdk";

import type { EnvelopeHeader } from "./envelope";
import { frameEnvelope } from "./envelope";

const store = new Map<string, Uint8Array>();

class BlobNotFoundError extends Error {
  constructor() {
    super("The requested blob does not exist");
    this.name = "BlobNotFoundError";
  }
}

function toBytes(body: unknown): Uint8Array {
  if (body instanceof Uint8Array) {
    return body;
  }
  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }
  if (Buffer.isBuffer(body)) {
    return new Uint8Array(body);
  }
  throw new Error("Unsupported blob body");
}

const put = mock(
  (pathname: string, body: unknown, options?: { allowOverwrite?: boolean }) => {
    if (options?.allowOverwrite === false && store.has(pathname)) {
      return Promise.reject(new Error("blob exists"));
    }
    store.set(pathname, toBytes(body));
    return Promise.resolve({ etag: "1", pathname });
  }
);

const get = mock((pathname: string) => {
  const bytes = store.get(pathname);
  if (!bytes) {
    return Promise.resolve(null);
  }
  return Promise.resolve({
    blob: { etag: "1", size: bytes.byteLength },
    statusCode: 200,
    stream: new Response(bytes).body,
  });
});

const head = mock((pathname: string) => {
  const bytes = store.get(pathname);
  if (!bytes) {
    return Promise.reject(new BlobNotFoundError());
  }
  return Promise.resolve({ pathname, size: bytes.byteLength });
});

mock.module("@vercel/blob", () => ({
  BlobNotFoundError,
  get,
  head,
  put,
}));

const {
  appendHostedVersion,
  createHosted,
  HOSTED_ID,
  HostedAuthError,
  HostedConflictError,
  isHostedId,
  markInscribed,
  newHostedId,
  readHostedRecord,
  readHostedVersion,
  recordPath,
  versionPath,
} = await import("./hosted");

const SENDER_IDENTITY =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const HEADER: EnvelopeHeader = {
  key: {
    keyID: "test-key",
    mode: "brc2-multi",
    payloadLength: 48,
    protocolID: [2, "bitplan"],
    senderIdentityKey: SENDER_IDENTITY,
    slots: [{ identityKey: SENDER_IDENTITY, length: 1, offset: 48 }],
  },
  v: 2,
};
const TXID = "a".repeat(64);

function envelope(fill = 0): Uint8Array {
  return frameEnvelope(
    HEADER,
    Uint8Array.from({ length: 49 }, () => fill)
  );
}

function secret(fill = 7): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, i) => (fill + i) % 256);
}

beforeEach(() => {
  store.clear();
  put.mockClear();
  get.mockClear();
  head.mockClear();
});

afterEach(() => {
  store.clear();
});

describe("hosted ids", () => {
  test("newHostedId matches the hosted id shape", () => {
    const id = newHostedId();
    expect(id.startsWith("h_")).toBe(true);
    expect(id).toHaveLength(22);
    expect(HOSTED_ID.test(id)).toBe(true);
    expect(isHostedId(id)).toBe(true);
    expect(isHostedId("h_short")).toBe(false);
    expect(isHostedId(`h_${"a".repeat(19)}`)).toBe(false);
    expect(isHostedId(`h_${"a".repeat(21)}`)).toBe(false);
  });
});

describe("hosted storage", () => {
  test("creates a first version and stores record plus envelope", async () => {
    const bytes = envelope();
    const record = await createHosted(secret(), bytes);

    expect(isHostedId(record.id)).toBe(true);
    expect(record.versions).toBe(1);
    expect(record.bytes).toEqual([bytes.byteLength]);
    expect(record.origin).toBeNull();
    expect(record.secretSha256).toBe(
      Utils.toHex(Hash.sha256(Array.from(secret())))
    );
    expect(store.has(recordPath(record.id))).toBe(true);
    expect(store.has(versionPath(record.id, 1))).toBe(true);
  });

  test("appends when the base version matches", async () => {
    const first = envelope(1);
    const second = envelope(2);
    const created = await createHosted(secret(), first);
    const updated = await appendHostedVersion(created.id, secret(), second, 1);

    expect(updated.versions).toBe(2);
    expect(updated.bytes).toEqual([first.byteLength, second.byteLength]);
  });

  test("refuses a mismatched base version", async () => {
    const created = await createHosted(secret(), envelope());
    try {
      await appendHostedVersion(created.id, secret(), envelope(2), 99);
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(HostedConflictError);
      if (error instanceof HostedConflictError) {
        expect(error.current).toBe(1);
        expect(error.inscribed).toBe(false);
      }
    }
  });

  test("refuses the wrong secret", async () => {
    const created = await createHosted(secret(), envelope());
    await expect(
      appendHostedVersion(created.id, secret(9), envelope(2), 1)
    ).rejects.toBeInstanceOf(HostedAuthError);
  });

  test("refuses append after inscribe", async () => {
    const created = await createHosted(secret(), envelope());
    const inscribed = await markInscribed(created.id, secret(), `${TXID}_0`);
    expect(inscribed.origin).toBe(`${TXID}_0`);
    try {
      await appendHostedVersion(created.id, secret(), envelope(2), 1);
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(HostedConflictError);
      if (error instanceof HostedConflictError) {
        expect(error.inscribed).toBe(true);
      }
    }
  });

  test("maps ORDFS seq onto hosted versions", async () => {
    const first = envelope(1);
    const second = envelope(2);
    const created = await createHosted(secret(), first);
    await appendHostedVersion(created.id, secret(), second, 1);

    const latest = await readHostedVersion(created.id, -1);
    const origin = await readHostedVersion(created.id, -2);
    const seq0 = await readHostedVersion(created.id, 0);
    const seq1 = await readHostedVersion(created.id, 1);
    const missing = await readHostedVersion(created.id, 2);

    expect(latest?.version).toBe(2);
    expect(latest?.bytes).toEqual(second);
    expect(origin?.version).toBe(1);
    expect(origin?.bytes).toEqual(first);
    expect(seq0?.version).toBe(1);
    expect(seq1?.version).toBe(2);
    expect(missing).toBeNull();
  });

  test("markInscribed records the chain origin", async () => {
    const created = await createHosted(secret(), envelope());
    await markInscribed(created.id, secret(), `${TXID}_3`);
    const record = await readHostedRecord(created.id);
    expect(record?.origin).toBe(`${TXID}_3`);
  });
});
