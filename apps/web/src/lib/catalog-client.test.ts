import { afterEach, describe, expect, test } from "bun:test";

import {
  CATALOG_CAPABILITY_INPUT,
  CATALOG_CAPABILITY_KEY_ID,
  CATALOG_CONTENT_KEY_ID,
  CATALOG_COUNTERPARTY,
  CATALOG_LOCATOR_LABEL,
  CATALOG_PROTOCOL_ID,
  CATALOG_WRITE_LABEL,
  type CatalogWallet,
  deriveCatalogId,
  deriveCatalogIdFromCapability,
  deriveWriteBearerFromCapability,
  fetchCatalogCiphertext,
  hasCatalogSupport,
  loadCatalog,
  parseCatalogBytes,
} from "./catalog-client";
import { isCatalogId } from "./catalog-id";

/**
 * Fixed public vector: rootCapability = bytes 0..31. Non-secret test input
 * pinning the frozen locator/write derivation for browser/CLI parity.
 */
const VECTOR_CAPABILITY = Uint8Array.from({ length: 32 }, (_, i) => i);
const VECTOR_CATALOG_ID = "c_yISrnI2sPW-WsJxzEMlblaKd4E7d3N321gU5Vk_BpYY";
const VECTOR_WRITE_BEARER = "WTkMgXsUMbhtDGdFtNcocGtOOEkqNO6yeXlDOXNyGHw";

function stubWallet(options?: {
  createHmacError?: Error;
  decryptError?: Error;
  hmac?: number[];
  plaintext?: Uint8Array;
}) {
  const calls: { createHmac: unknown[]; decrypt: unknown[] } = {
    createHmac: [],
    decrypt: [],
  };
  const wallet = {
    createHmac(args: unknown) {
      calls.createHmac.push(args);
      if (options?.createHmacError) {
        return Promise.reject(options.createHmacError);
      }
      return Promise.resolve({
        hmac:
          options?.hmac ??
          Array.from({ length: 32 }, (_, i) => (i * 7 + 3) % 256),
      });
    },
    decrypt(args: unknown) {
      calls.decrypt.push(args);
      if (options?.decryptError) {
        return Promise.reject(options.decryptError);
      }
      return Promise.resolve({
        plaintext: Array.from(options?.plaintext ?? new Uint8Array()),
      });
    },
  } as unknown as CatalogWallet;
  return { calls, wallet };
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const seen: { init?: RequestInit; url: string }[] = [];
  globalThis.fetch = ((url: unknown, init?: RequestInit) => {
    seen.push({ init, url: String(url) });
    return Promise.resolve(handler(String(url), init));
  }) as typeof fetch;
  return seen;
}

function okCiphertext(bytes: Uint8Array): Response {
  return new Response(bytes, { status: 200 });
}

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    chainOrigin: null,
    description: "A test plan",
    id: `h_${"a".repeat(20)}`,
    repoHost: "github.com",
    repoName: "repo",
    repoOrg: "org",
    state: "hosted",
    title: "Test plan",
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function catalogBytes(payload: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

describe("frozen derivation contract", () => {
  test("fixed vector pins the locator output", async () => {
    expect(await deriveCatalogIdFromCapability(VECTOR_CAPABILITY)).toBe(
      VECTOR_CATALOG_ID
    );
    expect(isCatalogId(VECTOR_CATALOG_ID)).toBe(true);
  });

  test("fixed vector pins a distinct write bearer", async () => {
    const bearer = await deriveWriteBearerFromCapability(VECTOR_CAPABILITY);
    expect(bearer).toBe(VECTOR_WRITE_BEARER);
    expect(`c_${bearer}`).not.toBe(VECTOR_CATALOG_ID);
  });

  test("wallet derivation uses the exact frozen inputs", async () => {
    const { calls, wallet } = stubWallet({
      hmac: Array.from(VECTOR_CAPABILITY),
    });
    expect(await deriveCatalogId(wallet)).toBe(VECTOR_CATALOG_ID);
    expect(calls.createHmac).toHaveLength(1);
    const args = calls.createHmac[0] as Record<string, unknown>;
    expect(args.protocolID).toEqual([
      CATALOG_PROTOCOL_ID[0],
      CATALOG_PROTOCOL_ID[1],
    ]);
    expect(args.protocolID).toEqual([2, "bitplan catalog"]);
    expect(args.keyID).toBe(CATALOG_CAPABILITY_KEY_ID);
    expect(args.counterparty).toBe(CATALOG_COUNTERPARTY);
    expect(
      new TextDecoder().decode(Uint8Array.from(args.data as number[]))
    ).toBe(CATALOG_CAPABILITY_INPUT);
  });

  test("frozen labels are exact", () => {
    expect(CATALOG_CAPABILITY_INPUT).toBe("bitplan catalog capability v1");
    expect(CATALOG_LOCATOR_LABEL).toBe("bitplan catalog locator v1");
    expect(CATALOG_WRITE_LABEL).toBe("bitplan catalog write v1");
    expect(CATALOG_CAPABILITY_KEY_ID).toBe("catalog-capability-v1");
    expect(CATALOG_CONTENT_KEY_ID).toBe("catalog-content-v1");
  });

  test("rejects a short wallet capability", async () => {
    const { wallet } = stubWallet({ hmac: [1, 2, 3] });
    await expect(deriveCatalogId(wallet)).rejects.toThrow("32");
  });

  test("catalog id shape", () => {
    expect(isCatalogId(VECTOR_CATALOG_ID)).toBe(true);
    expect(isCatalogId("c_short")).toBe(false);
    expect(isCatalogId(`c_${"a".repeat(42)}`)).toBe(false);
    expect(isCatalogId(`c_${"a".repeat(44)}`)).toBe(false);
    expect(isCatalogId(`x_${"a".repeat(43)}`)).toBe(false);
  });

  test("hasCatalogSupport narrows wallet surfaces", () => {
    const { wallet } = stubWallet();
    expect(hasCatalogSupport(wallet)).toBe(true);
    expect(hasCatalogSupport({ decrypt: () => undefined })).toBe(false);
    expect(hasCatalogSupport({})).toBe(false);
  });
});

describe("strict catalog validation", () => {
  test("accepts a valid hosted and inscribed entry", () => {
    const catalog = parseCatalogBytes(
      catalogBytes({
        entries: [
          validEntry(),
          validEntry({
            chainOrigin: `${"b".repeat(64)}_3`,
            id: `h_${"b".repeat(20)}`,
            state: "inscribed",
          }),
        ],
        schema: 1,
      })
    );
    expect(catalog.schema).toBe(1);
    expect(catalog.entries).toHaveLength(2);
  });

  test("accepts null metadata fields", () => {
    const catalog = parseCatalogBytes(
      catalogBytes({
        entries: [
          validEntry({
            description: null,
            repoHost: null,
            repoName: null,
            repoOrg: null,
            title: null,
          }),
        ],
        schema: 1,
      })
    );
    expect(catalog.entries[0]?.title).toBeNull();
  });

  for (const [label, mutate] of [
    ["unknown top-level key", (c: { extra?: number }) => ({ ...c, extra: 1 })],
    ["missing schema", (c: { schema?: number }) => ({ entries: c.entries })],
    ["wrong schema", (c: { entries: unknown }) => ({ ...c, schema: 2 })],
    ["non-array entries", () => ({ entries: {}, schema: 1 })],
  ] as const) {
    test(`rejects ${label}`, () => {
      const base = { entries: [validEntry()], schema: 1 };
      expect(() => parseCatalogBytes(catalogBytes(mutate(base)))).toThrow(
        "Invalid catalog"
      );
    });
  }

  test("rejects unknown entry keys", () => {
    expect(() =>
      parseCatalogBytes(
        catalogBytes({ entries: [{ ...validEntry(), extra: true }], schema: 1 })
      )
    ).toThrow("Invalid catalog");
  });

  test("rejects duplicate hosted ids", () => {
    expect(() =>
      parseCatalogBytes(
        catalogBytes({ entries: [validEntry(), validEntry()], schema: 1 })
      )
    ).toThrow("duplicate");
  });

  test("rejects bad ids, states, and origins", () => {
    for (const bad of [
      validEntry({ id: "h_short" }),
      validEntry({ state: "deleted" }),
      validEntry({ chainOrigin: `${"b".repeat(64)}_0` }),
      validEntry({
        chainOrigin: null,
        id: `h_${"c".repeat(20)}`,
        state: "inscribed",
      }),
      validEntry({
        chainOrigin: "not-an-origin",
        id: `h_${"d".repeat(20)}`,
        state: "inscribed",
      }),
    ]) {
      expect(() =>
        parseCatalogBytes(catalogBytes({ entries: [bad], schema: 1 }))
      ).toThrow("Invalid catalog");
    }
  });

  test("rejects unbounded strings, bad versions, and bad dates", () => {
    for (const bad of [
      validEntry({ title: "x".repeat(513) }),
      validEntry({ description: "x".repeat(1001) }),
      validEntry({ repoHost: "x".repeat(254) }),
      validEntry({ repoOrg: "x".repeat(256) }),
      validEntry({ repoName: "x".repeat(256) }),
      validEntry({ version: 0 }),
      validEntry({ version: 1.5 }),
      validEntry({ updatedAt: "not-a-date" }),
    ]) {
      expect(() =>
        parseCatalogBytes(catalogBytes({ entries: [bad], schema: 1 }))
      ).toThrow("Invalid catalog");
    }
  });

  test("counts string bounds by Unicode code points, like the CLI", () => {
    const ok = validEntry({ title: "😀".repeat(512) });
    expect(() =>
      parseCatalogBytes(catalogBytes({ entries: [ok], schema: 1 }))
    ).not.toThrow();
    const tooLong = validEntry({ title: "😀".repeat(513) });
    expect(() =>
      parseCatalogBytes(catalogBytes({ entries: [tooLong], schema: 1 }))
    ).toThrow("Invalid catalog");
  });

  test("rejects oversized catalogs", () => {
    const many = Array.from({ length: 1001 }, (_, i) =>
      validEntry({ id: `h_${String(i).padStart(20, "0")}` })
    );
    expect(() =>
      parseCatalogBytes(catalogBytes({ entries: many, schema: 1 }))
    ).toThrow("max");
    expect(() => parseCatalogBytes(new Uint8Array(512 * 1024 + 1))).toThrow(
      "max"
    );
  });

  test("rejects non-JSON plaintext", () => {
    expect(() =>
      parseCatalogBytes(new TextEncoder().encode("not json"))
    ).toThrow("Invalid catalog");
  });
});

describe("catalog fetch", () => {
  test("only 404 means missing", async () => {
    mockFetch(() => new Response(null, { status: 404 }));
    expect(await fetchCatalogCiphertext(VECTOR_CATALOG_ID)).toEqual({
      state: "missing",
    });
  });

  test("other http statuses are errors, never missing", async () => {
    mockFetch(() => new Response(null, { status: 500 }));
    expect(await fetchCatalogCiphertext(VECTOR_CATALOG_ID)).toEqual({
      reason: "http",
      state: "error",
      status: 500,
    });
  });

  test("network failure is a retryable error", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new Error("offline"))) as typeof fetch;
    expect(await fetchCatalogCiphertext(VECTOR_CATALOG_ID)).toEqual({
      reason: "network",
      state: "error",
    });
  });

  test("refuses to fetch a malformed id", async () => {
    await expect(fetchCatalogCiphertext("c_short")).rejects.toThrow(
      "malformed"
    );
  });
});

describe("loadCatalog", () => {
  const readyPlaintext = () =>
    catalogBytes({ entries: [validEntry()], schema: 1 });

  test("404 resolves to missing without touching decrypt", async () => {
    mockFetch(() => new Response(null, { status: 404 }));
    const { calls, wallet } = stubWallet({
      hmac: Array.from(VECTOR_CAPABILITY),
    });
    const loaded = await loadCatalog(wallet);
    expect(loaded).toEqual({ catalogId: VECTOR_CATALOG_ID, state: "missing" });
    expect(calls.decrypt).toHaveLength(0);
  });

  test("http errors abort without decrypting or writing", async () => {
    const seen = mockFetch(() => new Response(null, { status: 503 }));
    const { calls, wallet } = stubWallet({
      hmac: Array.from(VECTOR_CAPABILITY),
    });
    const loaded = await loadCatalog(wallet);
    expect(loaded.state).toBe("error");
    if (loaded.state === "error") {
      expect(loaded.reason).toBe("fetch");
    }
    expect(calls.decrypt).toHaveLength(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.init?.method).toBeUndefined();
  });

  test("decrypt uses the frozen content inputs", async () => {
    mockFetch((url) => {
      expect(url).toBe(`/api/catalog/${VECTOR_CATALOG_ID}`);
      return okCiphertext(Uint8Array.of(9, 9));
    });
    const { calls, wallet } = stubWallet({
      hmac: Array.from(VECTOR_CAPABILITY),
      plaintext: readyPlaintext(),
    });
    const loaded = await loadCatalog(wallet);
    expect(loaded.state).toBe("ready");
    expect(calls.decrypt).toHaveLength(1);
    const args = calls.decrypt[0] as Record<string, unknown>;
    expect(args.ciphertext).toEqual([9, 9]);
    expect(args.counterparty).toBe("self");
    expect(args.keyID).toBe("catalog-content-v1");
    expect(args.protocolID).toEqual([2, "bitplan catalog"]);
  });

  test("wallet refusal and bad schema are distinct errors", async () => {
    mockFetch(() => okCiphertext(Uint8Array.of(1)));
    const refused = stubWallet({
      decryptError: new Error("denied"),
      hmac: Array.from(VECTOR_CAPABILITY),
    });
    expect((await loadCatalog(refused.wallet)).state).toBe("error");

    mockFetch(() => okCiphertext(catalogBytes({ nope: true })));
    const schema = stubWallet({
      hmac: Array.from(VECTOR_CAPABILITY),
      plaintext: catalogBytes({ nope: true }),
    });
    const failed = await loadCatalog(schema.wallet);
    expect(failed.state).toBe("error");
    if (failed.state === "error") {
      expect(failed.reason).toBe("schema");
    }
  });

  test("derive refusal reports a derive error", async () => {
    const { wallet } = stubWallet({
      createHmacError: new Error("no hmac"),
    });
    const loaded = await loadCatalog(wallet);
    expect(loaded).toEqual({
      catalogId: null,
      reason: "derive",
      state: "error",
    });
  });
});
