import { afterEach, describe, expect, mock, test } from "bun:test";

import { frameEnvelope } from "./envelope";
import {
  BITPLAN_CONTENT_TYPE,
  fetchOrdfsContent,
  fetchOrdfsMeta,
  type OrdfsContentResult,
  ordfsContentUrl,
} from "./ordfs";
import { SITE_URL } from "./site";

const TXID = "a".repeat(64);
const ORIGIN = `${TXID}_0`;
const originalFetch = globalThis.fetch;

const SENDER_IDENTITY =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

function envelopeBytes(): Uint8Array {
  return frameEnvelope(
    {
      key: {
        keyID: "test-key",
        mode: "brc2-multi",
        payloadLength: 48,
        protocolID: [2, "bitplan"],
        senderIdentityKey: SENDER_IDENTITY,
        slots: [{ identityKey: SENDER_IDENTITY, length: 1, offset: 48 }],
      },
      v: 2,
    },
    new Uint8Array(49)
  );
}

function respond(body: BodyInit | null, init?: ResponseInit): Response {
  return new Response(body, init);
}

function resultFrom(response: Response): Promise<OrdfsContentResult> {
  globalThis.fetch = (() => Promise.resolve(response)) as typeof fetch;
  return fetchOrdfsContent(ORIGIN, -1);
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchOrdfsContent", () => {
  test("returns validated BitPlan envelope content", async () => {
    const response = respond(envelopeBytes(), {
      headers: {
        "content-type": `${BITPLAN_CONTENT_TYPE}; charset=binary`,
        "x-ord-seq": "2",
        "x-origin": ORIGIN,
        "x-outpoint": `${TXID}_1`,
      },
    });

    const result = await resultFrom(response);

    expect(result.state).toBe("found");
    if (result.state !== "found") {
      throw new Error("Expected found content");
    }
    expect(result.content.sequence).toBe(2);
    expect(result.content.origin).toBe(ORIGIN);
    expect(result.content.outpoint).toBe(`${TXID}_1`);
    expect(result.content.bytes).toEqual(envelopeBytes());
  });

  test("distinguishes missing content", async () => {
    const result = await resultFrom(new Response(null, { status: 404 }));
    expect(result).toEqual({ state: "not-found" });
  });

  test("distinguishes network failures", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new TypeError("offline"))) as typeof fetch;
    expect(await fetchOrdfsContent(ORIGIN, -1)).toEqual({
      state: "network-error",
    });
  });

  test("distinguishes server and other HTTP failures", async () => {
    expect(await resultFrom(new Response(null, { status: 503 }))).toEqual({
      state: "server-error",
      status: 503,
    });
    expect(await resultFrom(new Response(null, { status: 403 }))).toEqual({
      state: "request-error",
      status: 403,
    });
  });

  test("rejects a different media type before envelope parsing", async () => {
    const result = await resultFrom(
      new Response(envelopeBytes(), {
        headers: { "content-type": "application/x-bitplanevil" },
      })
    );
    expect(result).toEqual({
      contentType: "application/x-bitplanevil",
      reason: "content-type",
      state: "invalid-content",
    });
  });

  test("builds the proxy path for hosted ids", () => {
    const id = `h_${"b".repeat(20)}`;
    expect(ordfsContentUrl(id, -1)).toBe(`/ordfs/content/${id}:-1`);
  });

  test("HEADs the content proxy for hosted ids, not the gateway", async () => {
    const id = `h_${"c".repeat(20)}`;
    const fetchMock = mock((url: string, init?: RequestInit) => {
      expect(url).toBe(`${SITE_URL}/ordfs/content/${id}:-1`);
      expect(init?.method).toBe("HEAD");
      return Promise.resolve(
        new Response(null, {
          headers: {
            "content-length": "120",
            "content-type": BITPLAN_CONTENT_TYPE,
            "x-ord-seq": "0",
            "x-origin": id,
            "x-outpoint": id,
          },
          status: 200,
        })
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const meta = await fetchOrdfsMeta(id, -1);
    expect(meta?.byteLength).toBe(120);
    expect(meta?.origin).toBe(id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("rejects malformed envelopes with the correct media type", async () => {
    const result = await resultFrom(
      new Response(Uint8Array.of(1, 2, 3), {
        headers: { "content-type": BITPLAN_CONTENT_TYPE },
      })
    );
    expect(result).toEqual({
      contentType: BITPLAN_CONTENT_TYPE,
      reason: "envelope",
      state: "invalid-content",
    });
  });
});
