import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { EnvelopeHeader } from "@/lib/envelope";
import { frameEnvelope } from "@/lib/envelope";
import { HOSTED_ID } from "@/lib/hosted-id";

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

const { POST } = await import("./route");
const idRoute = await import("./[id]/route");
const { GET: ordfsGet } = await import("@/app/ordfs/content/[pointer]/route");

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
const BITPLAN_CONTENT_TYPE = "application/x-bitplan";

function envelope(): Uint8Array {
  return frameEnvelope(HEADER, new Uint8Array(49));
}

function secret(): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, i) => (i + 3) % 256);
}

function bearer(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const token = btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `Bearer ${token}`;
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function pointerContext(pointer: string) {
  return { params: Promise.resolve({ pointer }) };
}

beforeEach(() => {
  store.clear();
  put.mockClear();
  get.mockClear();
  head.mockClear();
});

afterEach(() => {
  store.clear();
  mock.restore();
});

describe("POST /api/hosted", () => {
  test("creates a hosted draft", async () => {
    const response = await POST(
      new Request("https://bitplan.dev/api/hosted", {
        body: envelope(),
        headers: {
          authorization: bearer(secret()),
          "content-type": BITPLAN_CONTENT_TYPE,
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.id).toMatch(HOSTED_ID);
    expect(body.viewer).toBe(`https://bitplan.dev/d/${body.id}`);
  });

  test("rejects a create without a secret", async () => {
    const response = await POST(
      new Request("https://bitplan.dev/api/hosted", {
        body: envelope(),
        headers: { "content-type": BITPLAN_CONTENT_TYPE },
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "missing-secret" });
  });
});

describe("POST /api/hosted/{id}", () => {
  test("conflicts when the base version does not match", async () => {
    const created = await POST(
      new Request("https://bitplan.dev/api/hosted", {
        body: envelope(),
        headers: {
          authorization: bearer(secret()),
          "content-type": BITPLAN_CONTENT_TYPE,
        },
        method: "POST",
      })
    );
    const { id } = (await created.json()) as { id: string };

    const response = await idRoute.POST(
      new Request(`https://bitplan.dev/api/hosted/${id}`, {
        body: envelope(),
        headers: {
          authorization: bearer(secret()),
          "content-type": BITPLAN_CONTENT_TYPE,
          "x-bitplan-base-version": "99",
        },
        method: "POST",
      }),
      context(id)
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      current: 1,
      error: "version-conflict",
    });
  });
});

describe("hosted content proxy", () => {
  test("returns 410 with the chain origin after inscribe", async () => {
    const created = await POST(
      new Request("https://bitplan.dev/api/hosted", {
        body: envelope(),
        headers: {
          authorization: bearer(secret()),
          "content-type": BITPLAN_CONTENT_TYPE,
        },
        method: "POST",
      })
    );
    const { id } = (await created.json()) as { id: string };
    const origin = `${TXID}_0`;

    const marked = await idRoute.PATCH(
      new Request(`https://bitplan.dev/api/hosted/${id}`, {
        body: JSON.stringify({ origin }),
        headers: {
          authorization: bearer(secret()),
          "content-type": "application/json",
        },
        method: "PATCH",
      }),
      context(id)
    );
    expect(marked.status).toBe(200);

    const response = await ordfsGet(
      new Request(`https://bitplan.dev/ordfs/content/${id}:-1`),
      pointerContext(`${id}:-1`)
    );
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ origin });
  });

  test("still proxies chain pointers to the gateway", async () => {
    const bytes = envelope();
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(bytes, {
          headers: { "content-type": BITPLAN_CONTENT_TYPE },
        })
      )
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const response = await ordfsGet(
        new Request(`https://bitplan.dev/ordfs/content/${TXID}_0:-1`),
        pointerContext(`${TXID}_0:-1`)
      );
      expect(response.status).toBe(200);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        `https://api.1sat.app/content/${TXID}_0:-1`
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
