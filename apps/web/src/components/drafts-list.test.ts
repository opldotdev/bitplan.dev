import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildRows,
  chainOriginsForDetails,
  classifyChainFailure,
  LoadedDrafts,
  walletIdentityKey,
} from "@/components/drafts-list";
import type { CatalogEntry } from "@/lib/catalog-client";
import { mergeCatalogPlans } from "@/lib/drafts";
import { EnvelopeAccessError, EnvelopeError } from "@/lib/envelope";

describe("wallet identity", () => {
  test("returns the connected wallet's normalized public identity", async () => {
    const publicKey =
      "02C6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5";
    const wallet = {
      getPublicKey: async () => ({ publicKey }),
    };

    expect(await walletIdentityKey(wallet)).toBe(publicKey.toLowerCase());
  });
});

describe("chain failure states", () => {
  const found = {
    content: {
      bytes: Uint8Array.of(1),
      contentType: "application/x-bitplan",
      origin: null,
      outpoint: null,
      sequence: 0,
    },
    state: "found",
  } as const;

  test("absent, network, server, and request failures are retryable", () => {
    for (const fetch of [
      { state: "not-found" },
      { state: "network-error" },
      { state: "server-error", status: 500 },
      { state: "request-error", status: 400 },
    ] as const) {
      expect(classifyChainFailure(fetch, null)).toBe("retryable");
    }
  });

  test("invalid envelope content is unsupported, never retryable", () => {
    for (const fetch of [
      {
        contentType: "application/x-bitplan",
        reason: "envelope",
        state: "invalid-content",
      },
      {
        contentType: "text/html",
        reason: "content-type",
        state: "invalid-content",
      },
    ] as const) {
      expect(classifyChainFailure(fetch, null)).toBe("unsupported");
    }
  });

  test("wallet authorization failures name the wallet", () => {
    for (const issue of [
      "not-authorized",
      "decrypt-refused",
      "identity-unavailable",
    ] as const) {
      expect(
        classifyChainFailure(found, new EnvelopeAccessError(issue, "nope"))
      ).toBe("not-authorized");
    }
  });

  test("unsupported envelope versions are unsupported", () => {
    expect(
      classifyChainFailure(
        found,
        new EnvelopeError(
          "Unsupported bitplan envelope version 0x01; this viewer reads envelope version 0x02."
        )
      )
    ).toBe("unsupported");
  });

  test("unknown decrypt failures stay retryable", () => {
    expect(classifyChainFailure(found, new Error("boom"))).toBe("retryable");
    expect(
      classifyChainFailure(found, new EnvelopeError("payload failed"))
    ).toBe("retryable");
  });
});

const CATALOG_ORIGIN = `${"c".repeat(64)}_1`;
const WALLET_ORIGIN = `${"d".repeat(64)}_0`;

function catalogEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    chainOrigin: null,
    description: null,
    id: `h_${"e".repeat(20)}`,
    repoHost: null,
    repoName: null,
    repoOrg: null,
    state: "hosted",
    title: "Hosted plan",
    updatedAt: "2026-09-02T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function inscribedEntry(): CatalogEntry {
  return catalogEntry({
    chainOrigin: CATALOG_ORIGIN,
    id: `h_${"f".repeat(20)}`,
    state: "inscribed",
    title: "Catalog-only inscribed",
  });
}

const stubWallet = {
  getPublicKey: async () => ({ publicKey: "02" }),
} as never;

function loadedMarkup(props: {
  catalog: { state: "loading" | "absent" | "ready" | "error" };
  coins: { origin: string; outpoint: string }[];
  details: Record<
    string,
    | never
    | { status: "ok"; meta: never; latestVersion: number | null }
    | { status: "retryable" | "unsupported" | "not-authorized" }
  >;
  hosted: CatalogEntry[];
}): string {
  return renderToStaticMarkup(
    createElement(LoadedDrafts, {
      catalog: props.catalog,
      coins: props.coins,
      details: props.details as never,
      hosted: props.hosted,
      onRetryCatalog: () => undefined,
      onRetryRow: () => undefined,
      reloadingRows: [],
      wallet: stubWallet,
    })
  );
}

describe("catalog detail origins", () => {
  test("loads the union of wallet and catalog-only inscribed origins, deduped", () => {
    const origins = chainOriginsForDetails(
      [{ origin: WALLET_ORIGIN }],
      [inscribedEntry(), catalogEntry()]
    );
    expect(origins).toContain(WALLET_ORIGIN);
    expect(origins).toContain(CATALOG_ORIGIN);
    // Hosted-only entries need no chain detail load.
    expect(origins).toHaveLength(2);
  });

  test("dedupes an inscribed origin the wallet also holds", () => {
    const origins = chainOriginsForDetails(
      [{ origin: CATALOG_ORIGIN }],
      [inscribedEntry()]
    );
    expect(origins).toEqual([CATALOG_ORIGIN]);
  });

  test("a catalog-only inscribed plan builds a chain row, not a silent gap", () => {
    const plans = mergeCatalogPlans([inscribedEntry()], []);
    const rows = buildRows(plans, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.plan.source).toBe("chain");
    expect(rows[0]?.plan.origin).toBe(CATALOG_ORIGIN);
    // Without details yet the row is retryable, never dropped.
    expect(rows[0]?.detail).toEqual({ status: "retryable" });
  });
});

describe("LoadedDrafts behavior", () => {
  test("catalog failure with no chain rows shows only the retryable warning", () => {
    const markup = loadedMarkup({
      catalog: { state: "error" },
      coins: [],
      details: {},
      hosted: [],
    });
    expect(markup).toContain("Could not load hosted plans");
    expect(markup).toContain("Retry");
    expect(markup).not.toContain("No drafts in this wallet yet");
  });

  test("catalog loading with no rows shows no false empty state", () => {
    const markup = loadedMarkup({
      catalog: { state: "loading" },
      coins: [],
      details: {},
      hosted: [],
    });
    expect(markup).not.toContain("No drafts in this wallet yet");
  });

  test("an empty wallet with a readable catalog states emptiness once", () => {
    const markup = loadedMarkup({
      catalog: { state: "ready" },
      coins: [],
      details: {},
      hosted: [],
    });
    expect(markup).toContain("No drafts in this wallet yet");
  });

  test("catalog-only inscribed rows link to the chain viewer", () => {
    const meta = {
      cliVersion: "test",
      createdAt: "2026-09-03T00:00:00.000Z",
      description: null,
      fileSha256: "hash",
      gitBranch: null,
      gitCommitSha: null,
      gitCommitSubject: null,
      gitDirty: null,
      repoHost: null,
      repoName: null,
      repoOrg: null,
      title: "Catalog-only plan",
    };
    const markup = loadedMarkup({
      catalog: { state: "ready" },
      coins: [],
      details: {
        [CATALOG_ORIGIN]: { latestVersion: 1, meta, status: "ok" },
      },
      hosted: [inscribedEntry()],
    });
    expect(markup).toContain(`/d/${CATALOG_ORIGIN}`);
    expect(markup).toContain("Catalog-only plan");
    expect(markup).not.toContain("No drafts in this wallet yet");
  });

  test("catalog-only inscribed rows stay retryable until details load", () => {
    const markup = loadedMarkup({
      catalog: { state: "ready" },
      coins: [],
      details: {},
      hosted: [inscribedEntry()],
    });
    expect(markup).toContain("Could not load this plan");
    expect(markup).toContain("Retry");
    expect(markup).not.toContain("No drafts in this wallet yet");
  });

  test("filters appear only when both hosted and chain rows exist", () => {
    const both = loadedMarkup({
      catalog: { state: "ready" },
      coins: [{ origin: WALLET_ORIGIN, outpoint: WALLET_ORIGIN }],
      details: { [WALLET_ORIGIN]: { status: "retryable" } },
      hosted: [catalogEntry()],
    });
    expect(both).toContain("Filter drafts");
    expect(both).toContain("Hosted");
    expect(both).toContain("On chain");

    const chainOnly = loadedMarkup({
      catalog: { state: "ready" },
      coins: [{ origin: WALLET_ORIGIN, outpoint: WALLET_ORIGIN }],
      details: { [WALLET_ORIGIN]: { status: "retryable" } },
      hosted: [],
    });
    expect(chainOnly).not.toContain("Filter drafts");
  });

  test("corrupt envelopes use the honest unsupported label", () => {
    const markup = loadedMarkup({
      catalog: { state: "ready" },
      coins: [{ origin: WALLET_ORIGIN, outpoint: WALLET_ORIGIN }],
      details: { [WALLET_ORIGIN]: { status: "unsupported" } },
      hosted: [],
    });
    expect(markup).toContain("Unsupported or invalid format");
    expect(markup).not.toContain("Unsupported old format");
  });
});
