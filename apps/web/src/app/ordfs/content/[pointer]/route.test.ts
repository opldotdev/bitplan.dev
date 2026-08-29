import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { frameEnvelope, type PrivateEnvelopeHeader } from "@/lib/envelope";

import { GET, HEAD } from "./route";

const TXID = "a".repeat(64);
const HEADER: PrivateEnvelopeHeader = {
  key: {
    keyID: "test-key",
    mode: "brc2-self",
    protocolID: [2, "bitplan"],
  },
  v: 1,
};

function context(pointer: string) {
  return { params: Promise.resolve({ pointer }) };
}

function envelope() {
  return frameEnvelope(HEADER, Uint8Array.of(1, 2, 3));
}

afterEach(() => mock.restore());

describe("OrdFS content route", () => {
  test("allows only a validated BitPlan content pointer", async () => {
    const fetchMock = spyOn(globalThis, "fetch");

    const response = await GET(
      new Request("https://bitplan.dev/ordfs/content/nope"),
      context("nope")
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid-pointer" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns a validated envelope with inert response headers", async () => {
    const bytes = envelope();
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(bytes, {
        headers: {
          "content-type": BITPLAN_CONTENT_TYPE,
          "x-ord-seq": "0",
          "x-origin": `${TXID}.0`,
          "x-outpoint": `${TXID}.0`,
        },
      })
    );

    const response = await GET(
      new Request(`https://bitplan.dev/ordfs/content/${TXID}_0:-1`),
      context(`${TXID}_0:-1`)
    );

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-type")).toBe(BITPLAN_CONTENT_TYPE);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://api.1sat.app/content/${TXID}_0:-1`
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
  });

  test("refuses upstream active content and oversized envelopes", async () => {
    const fetchMock = spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response("<script>bad()</script>", {
        headers: { "content-type": "text/html" },
      })
    );
    fetchMock.mockResolvedValueOnce(
      new Response(envelope(), {
        headers: {
          "content-length": String(641 * 1024),
          "content-type": BITPLAN_CONTENT_TYPE,
        },
      })
    );

    const active = await GET(
      new Request(`https://bitplan.dev/ordfs/content/${TXID}_0:-1`),
      context(`${TXID}_0:-1`)
    );
    const oversized = await GET(
      new Request(`https://bitplan.dev/ordfs/content/${TXID}_0:-1`),
      context(`${TXID}_0:-1`)
    );

    expect(active.status).toBe(502);
    expect(await active.json()).toMatchObject({ error: "not-bitplan" });
    expect(oversized.status).toBe(502);
    expect(await oversized.json()).toMatchObject({ error: "too-large" });
  });

  test("supports metadata HEAD without returning a body", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        headers: {
          "content-length": "100",
          "content-type": BITPLAN_CONTENT_TYPE,
        },
      })
    );

    const response = await HEAD(
      new Request(`https://bitplan.dev/ordfs/content/${TXID}_0:-1`),
      context(`${TXID}_0:-1`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("100");
    expect(await response.text()).toBe("");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" });
  });
});

const BITPLAN_CONTENT_TYPE = "application/x-bitplan";
