import { describe, expect, test } from "bun:test";
import { Utils } from "@bsv/sdk";

import { openEnvelope } from "./envelope";
import { createInstantDraft } from "./instant-draft";
import { linkWallet, parseLinkFragment } from "./link-reader";

const HTML =
  '<!doctype html><html data-bitplan-template="brief"><title>Brief</title><body>hello</body></html>';
const VIEWER_PATTERN =
  /^\/d\/h_abcdefghijklmnopqrst\?collaborate=1#k=[A-Za-z0-9_-]{43}$/;

describe("createInstantDraft", () => {
  test("seals the template for a throwaway reader and keeps the hosted secret out of the link", async () => {
    let uploaded: Uint8Array | undefined;
    let bearer = "";
    const fetchMock = ((input: URL | RequestInfo, init?: RequestInit) => {
      if (String(input) === "/templates/brief.html") {
        return Promise.resolve(
          new Response(HTML, {
            headers: { "content-type": "text/html; charset=utf-8" },
          })
        );
      }
      expect(String(input)).toBe("/api/hosted");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("content-type")).toBe(
        "application/x-bitplan"
      );
      bearer = new Headers(init?.headers).get("authorization")?.slice(7) ?? "";
      uploaded = new Uint8Array(init?.body as ArrayBuffer);
      return Promise.resolve(
        Response.json(
          { id: "h_abcdefghijklmnopqrst", version: 1 },
          { status: 201 }
        )
      );
    }) as typeof fetch;

    const viewer = await createInstantDraft(
      { layout: "brief", title: "Shared launch plan" },
      fetchMock
    );

    expect(viewer).toMatch(VIEWER_PATTERN);
    const readerSecret = parseLinkFragment(
      new URL(viewer, "https://bitplan.dev").href
    );
    expect(readerSecret).not.toBeNull();
    expect(base64UrlHex(bearer)).not.toBe(readerSecret);
    expect(viewer).not.toContain(bearer);

    const opened = await openEnvelope(
      linkWallet(readerSecret as string),
      uploaded as Uint8Array
    );
    expect(opened.plaintext.html).toBe(HTML);
    expect(opened.plaintext.meta.title).toBe("Shared launch plan");
    expect(opened.plaintext.meta.fileSha256).toHaveLength(64);
  });

  test("rejects an unmarked starter before upload", async () => {
    let requests = 0;
    const fetchMock = (() => {
      requests += 1;
      return Promise.resolve(
        new Response("<!doctype html><p>not a starter</p>", {
          headers: { "content-type": "text/html" },
        })
      );
    }) as typeof fetch;

    await expect(
      createInstantDraft(
        { layout: "terminal", title: "Invalid starter" },
        fetchMock
      )
    ).rejects.toThrow("not a recognized BitPlan template");
    expect(requests).toBe(1);
  });

  test("rejects an unknown starter without making a request", async () => {
    let requests = 0;
    const fetchMock = (() => {
      requests += 1;
      return Promise.reject(new Error("should not fetch"));
    }) as typeof fetch;

    await expect(
      createInstantDraft(
        {
          layout: "external" as "brief",
          title: "Unknown starter",
        },
        fetchMock
      )
    ).rejects.toThrow("recognized BitPlan starter page");
    expect(requests).toBe(0);
  });
});

function base64UrlHex(value: string): string {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Utils.toHex(Utils.toArray(base64, "base64"));
}
