import { afterEach, describe, expect, mock, test } from "bun:test";
import type { WalletInterface } from "@bsv/sdk";

import {
  draftInputFromAgent,
  prepareDraft,
  publishDraft,
} from "./draft-publish";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const TXID = "a".repeat(64);
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("prepareDraft", () => {
  test("accepts only text fields from browser agents", () => {
    expect(draftInputFromAgent({ body: "Plan", title: "Title" })).toEqual({
      body: "Plan",
      repository: "",
      title: "Title",
    });
    expect(() => draftInputFromAgent({ body: 1, title: "Title" })).toThrow(
      "as text"
    );
  });

  test("builds deterministic safe HTML and repository metadata", () => {
    const input = {
      body: 'Outcome\n\n<img src=x onerror="steal()">',
      repository: "https://github.com/opldotdev/bitplan.dev.git?tab=readme#top",
      title: "Ship <script>alert(1)</script>",
    };
    const first = prepareDraft(input, NOW);
    const second = prepareDraft(input, NOW);

    expect(first).toEqual(second);
    expect(first.html).not.toContain("<script>");
    expect(first.html).not.toContain("<img");
    expect(first.html).toContain("&lt;script&gt;");
    expect(first.html).toContain(
      'href="https://github.com/opldotdev/bitplan.dev"'
    );
    expect(first.meta).toMatchObject({
      createdAt: NOW.toISOString(),
      gitBranch: null,
      gitCommitSha: null,
      repoHost: "github.com",
      repoName: "bitplan.dev",
      repoOrg: "opldotdev",
    });
  });

  test("requires content and a complete HTTPS repository URL", () => {
    expect(() =>
      prepareDraft({ body: "Plan", repository: "", title: "" }, NOW)
    ).toThrow("title");
    expect(() =>
      prepareDraft(
        {
          body: "Plan",
          repository: "http://github.com/opldotdev/bitplan.dev",
          title: "Title",
        },
        NOW
      )
    ).toThrow("HTTPS");
  });
});

describe("publishDraft", () => {
  test("encrypts, creates one inscription, and notifies 1Sat", async () => {
    const createAction = mock(() =>
      Promise.resolve({ tx: [1, 2, 3], txid: TXID })
    );
    const encrypt = mock((args: { plaintext: number[] }) =>
      Promise.resolve({ ciphertext: args.plaintext })
    );
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ txid: TXID, txStatus: "ACCEPTED_BY_NETWORK" }),
          { status: 200 }
        )
      )
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const wallet = {
      createAction,
      encrypt,
      getPublicKey: () =>
        Promise.resolve({
          publicKey:
            "03d90d0c79bb43117a1d2f94e64986d921d825c73f32db6b2460232dc7a72875c4",
        }),
    } as unknown as WalletInterface;
    const plaintext = prepareDraft(
      { body: "Outcome", repository: "", title: "Plan" },
      NOW
    );

    const result = await publishDraft(wallet, plaintext);

    expect(result).toEqual({ origin: `${TXID}_0`, relayed: true });
    expect(encrypt).toHaveBeenCalledTimes(1);
    expect(createAction).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createAction.mock.calls[0]?.[0]?.outputs?.[0]?.tags).toEqual(
      expect.arrayContaining(["type:application/x-bitplan", "origin"])
    );
  });
});
