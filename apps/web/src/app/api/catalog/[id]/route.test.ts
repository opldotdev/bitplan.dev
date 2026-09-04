import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

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

let failRecordWrites = 0;

const put = mock(
  (pathname: string, body: unknown, options?: { allowOverwrite?: boolean }) => {
    if (pathname.endsWith("/record.json") && failRecordWrites > 0) {
      failRecordWrites -= 1;
      return Promise.reject(new Error("injected record write failure"));
    }
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

const { GET, PUT } = await import("./route");
const { CATALOG_CONTENT_TYPE } = await import("@/lib/catalog-id");
const {
  catalogClaimPath,
  catalogRecordPath,
  catalogVersionPath,
  MAX_CATALOG_BYTES,
  sha256Hex,
  verifyCatalogBearer,
} = await import("@/lib/catalog-store");

const ID = `c_${"a".repeat(43)}`;
const OTHER_ID = `c_${"b".repeat(43)}`;

function secret(fill = 7): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, i) => (fill + i) % 256);
}

function bearer(bytes: Uint8Array): string {
  return `Bearer ${Buffer.from(bytes).toString("base64url")}`;
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function putRequest(
  id: string,
  init: {
    authorization?: string;
    baseVersion?: string;
    body?: Uint8Array;
    contentType?: string;
  } = {}
): Request {
  const headers: Record<string, string> = {};
  if (init.authorization !== undefined) {
    headers.authorization = init.authorization;
  }
  if (init.baseVersion !== undefined) {
    headers["x-bitplan-base-version"] = init.baseVersion;
  }
  headers["content-type"] =
    init.contentType === undefined ? CATALOG_CONTENT_TYPE : init.contentType;
  return new Request(`https://bitplan.dev/api/catalog/${id}`, {
    body: init.body ?? new TextEncoder().encode("ciphertext-v1"),
    headers,
    method: "PUT",
  });
}

function storedRecord(id: string): Record<string, unknown> {
  const bytes = store.get(catalogRecordPath(id));
  if (!bytes) {
    throw new Error("expected a stored record");
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

beforeEach(() => {
  store.clear();
  failRecordWrites = 0;
  put.mockClear();
  get.mockClear();
  head.mockClear();
});

afterEach(() => {
  store.clear();
});

describe("catalog id validation", () => {
  test("GET rejects a malformed id with 400", async () => {
    const response = await GET(
      new Request("https://bitplan.dev/api/catalog/nope"),
      context("nope")
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid-id" });
  });

  test("PUT rejects a malformed id with 400", async () => {
    const response = await PUT(
      putRequest("nope", {
        authorization: bearer(secret()),
        baseVersion: "0",
      }),
      context("nope")
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid-id" });
  });
});

describe("PUT /api/catalog/{id}", () => {
  test("requires a bearer with 401", async () => {
    const response = await PUT(
      putRequest(ID, { baseVersion: "0" }),
      context(ID)
    );
    expect(response.status).toBe(401);
  });

  test("rejects a malformed bearer with 401", async () => {
    const authorizations = [
      "Bearer short",
      "Bearer not-base64url!!!!",
      `Bearer ${"a".repeat(42)}`,
      "Token abc",
    ];
    const responses = await Promise.all(
      authorizations.map((authorization) =>
        PUT(putRequest(ID, { authorization, baseVersion: "0" }), context(ID))
      )
    );
    for (const response of responses) {
      expect(response.status).toBe(401);
    }
  });

  test("requires the catalog content type with 415", async () => {
    const response = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        contentType: "application/octet-stream",
      }),
      context(ID)
    );
    expect(response.status).toBe(415);
  });

  test("requires an integer base version >= 0 with 400", async () => {
    const baseVersions = ["", "abc", "-1", "1.5", "01"];
    const responses = await Promise.all(
      baseVersions.map((baseVersion) =>
        PUT(
          putRequest(ID, {
            authorization: bearer(secret()),
            baseVersion,
          }),
          context(ID)
        )
      )
    );
    for (const response of responses) {
      expect(response.status).toBe(400);
    }
    const payloads = await Promise.all(
      responses.map((response) => response.json())
    );
    for (const payload of payloads) {
      expect(payload).toMatchObject({ error: "invalid-base-version" });
    }
    const missing = await PUT(
      new Request(`https://bitplan.dev/api/catalog/${ID}`, {
        body: new TextEncoder().encode("ciphertext-v1"),
        headers: {
          authorization: bearer(secret()),
          "content-type": CATALOG_CONTENT_TYPE,
        },
        method: "PUT",
      }),
      context(ID)
    );
    expect(missing.status).toBe(400);
  });

  test("rejects an oversized ciphertext with 413", async () => {
    const response = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: new Uint8Array(MAX_CATALOG_BYTES + 1),
      }),
      context(ID)
    );
    expect(response.status).toBe(413);
  });

  test("creates with base version 0 and stores hash plus version blob", async () => {
    const ciphertext = new TextEncoder().encode("ciphertext-v1");
    const rawToken = Buffer.from(secret()).toString("base64url");
    const response = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: ciphertext,
      }),
      context(ID)
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ created: true, id: ID, version: 1 });
    expect(typeof body.updatedAt).toBe("string");

    const record = storedRecord(ID);
    expect(record).toMatchObject({
      bytes: ciphertext.byteLength,
      id: ID,
      secretSha256: sha256Hex(secret()),
      version: 1,
    });
    expect(JSON.stringify(record)).not.toContain(rawToken);
    expect(store.get(catalogVersionPath(ID, 1))).toEqual(ciphertext);

    const claimBytes = store.get(catalogClaimPath(ID));
    expect(claimBytes).toBeDefined();
    const claim = JSON.parse(
      new TextDecoder().decode(claimBytes as Uint8Array)
    ) as Record<string, unknown>;
    expect(claim).toMatchObject({
      id: ID,
      secretSha256: sha256Hex(secret()),
    });
    expect(typeof claim.createdAt).toBe("string");
    expect(JSON.stringify(claim)).not.toContain(rawToken);
    expect(record.createdAt).toBe(claim.createdAt);

    const calls = put.mock.calls.map((call) => ({
      allowOverwrite: (call[2] as { allowOverwrite?: boolean } | undefined)
        ?.allowOverwrite,
      pathname: call[0] as string,
    }));
    expect(calls).toEqual([
      { allowOverwrite: false, pathname: catalogClaimPath(ID) },
      { allowOverwrite: false, pathname: catalogVersionPath(ID, 1) },
      { allowOverwrite: true, pathname: catalogRecordPath(ID) },
    ]);
  });

  test("updates with the exact current version", async () => {
    await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: new TextEncoder().encode("ciphertext-v1"),
      }),
      context(ID)
    );
    const updated = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "1",
        body: new TextEncoder().encode("ciphertext-v2"),
      }),
      context(ID)
    );

    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      created: false,
      id: ID,
      version: 2,
    });
    expect(new TextDecoder().decode(store.get(catalogVersionPath(ID, 1)))).toBe(
      "ciphertext-v1"
    );
    expect(new TextDecoder().decode(store.get(catalogVersionPath(ID, 2)))).toBe(
      "ciphertext-v2"
    );
  });

  test("rejects a repeated create with 409 and the current version", async () => {
    await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
      }),
      context(ID)
    );
    const response = await PUT(
      putRequest(ID, {
        authorization: bearer(secret(9)),
        baseVersion: "0",
      }),
      context(ID)
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      current: 1,
      error: "version-conflict",
    });
  });

  test("rejects a stale base version with 409 and the current version", async () => {
    await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
      }),
      context(ID)
    );
    await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "1",
        body: new TextEncoder().encode("ciphertext-v2"),
      }),
      context(ID)
    );
    const response = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "1",
        body: new TextEncoder().encode("ciphertext-stale"),
      }),
      context(ID)
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      current: 2,
      error: "version-conflict",
    });
  });

  test("conflicts when the base version is positive but nothing exists", async () => {
    const response = await PUT(
      putRequest(OTHER_ID, {
        authorization: bearer(secret()),
        baseVersion: "3",
      }),
      context(OTHER_ID)
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      current: 0,
      error: "version-conflict",
    });
  });

  test("rejects the wrong bearer with 401", async () => {
    await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
      }),
      context(ID)
    );
    const response = await PUT(
      putRequest(ID, {
        authorization: bearer(secret(9)),
        baseVersion: "1",
        body: new TextEncoder().encode("ciphertext-v2"),
      }),
      context(ID)
    );
    expect(response.status).toBe(401);
  });

  test("reports unavailable storage with 503", async () => {
    store.set(catalogRecordPath(ID), new TextEncoder().encode("not-json{"));
    const response = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "1",
        body: new TextEncoder().encode("ciphertext-v2"),
      }),
      context(ID)
    );
    expect(response.status).toBe(503);
  });
});

describe("GET /api/catalog/{id}", () => {
  test("returns 404 when no catalog exists", async () => {
    const response = await GET(
      new Request(`https://bitplan.dev/api/catalog/${ID}`),
      context(ID)
    );
    expect(response.status).toBe(404);
  });

  test("returns the current ciphertext with version headers", async () => {
    const first = new TextEncoder().encode("ciphertext-v1");
    const second = new TextEncoder().encode("ciphertext-v2");
    await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: first,
      }),
      context(ID)
    );
    await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "1",
        body: second,
      }),
      context(ID)
    );

    const response = await GET(
      new Request(`https://bitplan.dev/api/catalog/${ID}`),
      context(ID)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(CATALOG_CONTENT_TYPE);
    expect(response.headers.get("x-bitplan-catalog-version")).toBe("2");
    expect(typeof response.headers.get("x-bitplan-catalog-updated-at")).toBe(
      "string"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(second);
  });

  test("reports unavailable storage with 503", async () => {
    store.set(catalogRecordPath(ID), new TextEncoder().encode("not-json{"));
    const response = await GET(
      new Request(`https://bitplan.dev/api/catalog/${ID}`),
      context(ID)
    );
    expect(response.status).toBe(503);
  });
});

describe("orphan promotion", () => {
  test("promotes a partially committed create instead of wedging", async () => {
    const first = new TextEncoder().encode("ciphertext-create-orphan");
    failRecordWrites = 1;
    const failed = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: first,
      }),
      context(ID)
    );
    expect(failed.status).toBe(503);
    expect(store.get(catalogVersionPath(ID, 1))).toEqual(first);
    expect(store.get(catalogRecordPath(ID))).toBeUndefined();

    const retryBytes = new TextEncoder().encode(
      "ciphertext-create-retry-different"
    );
    const retry = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: retryBytes,
      }),
      context(ID)
    );
    expect(retry.status).toBe(409);
    expect(await retry.json()).toMatchObject({
      current: 1,
      error: "version-conflict",
    });

    const record = storedRecord(ID);
    expect(record).toMatchObject({
      bytes: first.byteLength,
      id: ID,
      secretSha256: sha256Hex(secret()),
      version: 1,
    });
    expect(store.get(catalogVersionPath(ID, 1))).toEqual(first);
    const claimAfter = JSON.parse(
      new TextDecoder().decode(store.get(catalogClaimPath(ID)) as Uint8Array)
    ) as Record<string, unknown>;
    expect(claimAfter).toMatchObject({
      id: ID,
      secretSha256: sha256Hex(secret()),
    });
    expect(record.createdAt).toBe(claimAfter.createdAt);
    expect(retryBytes).not.toEqual(first);

    const fetched = await GET(
      new Request(`https://bitplan.dev/api/catalog/${ID}`),
      context(ID)
    );
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("x-bitplan-catalog-version")).toBe("1");
    expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(first);

    const second = new TextEncoder().encode("ciphertext-v2-after-promotion");
    const advanced = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "1",
        body: second,
      }),
      context(ID)
    );
    expect(advanced.status).toBe(200);
    expect(await advanced.json()).toMatchObject({ version: 2 });
    expect(new TextDecoder().decode(store.get(catalogVersionPath(ID, 2)))).toBe(
      "ciphertext-v2-after-promotion"
    );
  });

  test("promotes a partially committed update instead of wedging", async () => {
    const first = new TextEncoder().encode("ciphertext-v1");
    const create = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: first,
      }),
      context(ID)
    );
    expect(create.status).toBe(201);
    const { createdAt } = storedRecord(ID);

    const orphan = new TextEncoder().encode("ciphertext-v2-orphan");
    failRecordWrites = 1;
    const failed = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "1",
        body: orphan,
      }),
      context(ID)
    );
    expect(failed.status).toBe(503);
    expect(store.get(catalogVersionPath(ID, 2))).toEqual(orphan);
    expect(storedRecord(ID)).toMatchObject({ version: 1 });

    const different = new TextEncoder().encode("ciphertext-v2-retry-different");
    const retry = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "1",
        body: different,
      }),
      context(ID)
    );
    expect(retry.status).toBe(409);
    expect(await retry.json()).toMatchObject({
      current: 2,
      error: "version-conflict",
    });

    const promoted = storedRecord(ID);
    expect(promoted).toMatchObject({
      bytes: orphan.byteLength,
      createdAt,
      id: ID,
      secretSha256: sha256Hex(secret()),
      version: 2,
    });
    expect(store.get(catalogVersionPath(ID, 2))).toEqual(orphan);

    const fetched = await GET(
      new Request(`https://bitplan.dev/api/catalog/${ID}`),
      context(ID)
    );
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("x-bitplan-catalog-version")).toBe("2");
    expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(orphan);

    const wrong = await PUT(
      putRequest(ID, {
        authorization: bearer(secret(9)),
        baseVersion: "2",
        body: new TextEncoder().encode("ciphertext-v3-wrong"),
      }),
      context(ID)
    );
    expect(wrong.status).toBe(401);

    const third = new TextEncoder().encode("ciphertext-v3");
    const advanced = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "2",
        body: third,
      }),
      context(ID)
    );
    expect(advanced.status).toBe(200);
    expect(await advanced.json()).toMatchObject({ version: 3 });
    expect(store.get(catalogVersionPath(ID, 3))).toEqual(third);
  });

  test("a different bearer cannot claim a partial create", async () => {
    const first = new TextEncoder().encode("ciphertext-create-orphan");
    failRecordWrites = 1;
    const failed = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: first,
      }),
      context(ID)
    );
    expect(failed.status).toBe(503);
    const claimBefore = new TextDecoder().decode(
      store.get(catalogClaimPath(ID)) as Uint8Array
    );

    const retry = await PUT(
      putRequest(ID, {
        authorization: bearer(secret(9)),
        baseVersion: "0",
        body: new TextEncoder().encode("ciphertext-attacker"),
      }),
      context(ID)
    );
    expect(retry.status).toBe(401);
    expect(store.get(catalogRecordPath(ID))).toBeUndefined();
    expect(
      new TextDecoder().decode(store.get(catalogClaimPath(ID)) as Uint8Array)
    ).toBe(claimBefore);
    expect(store.get(catalogVersionPath(ID, 1))).toEqual(first);

    const recovery = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: new TextEncoder().encode("ciphertext-retry-ignored"),
      }),
      context(ID)
    );
    expect(recovery.status).toBe(409);
    expect(await recovery.json()).toMatchObject({ current: 1 });
    expect(store.get(catalogVersionPath(ID, 1))).toEqual(first);
    expect(storedRecord(ID)).toMatchObject({
      bytes: first.byteLength,
      secretSha256: sha256Hex(secret()),
      version: 1,
    });
  });

  test("a claim-only partial create can be retried by the same bearer", async () => {
    const claim = {
      createdAt: new Date().toISOString(),
      id: ID,
      secretSha256: sha256Hex(secret()),
    };
    store.set(
      catalogClaimPath(ID),
      new TextEncoder().encode(JSON.stringify(claim))
    );
    const response = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: new TextEncoder().encode("ciphertext-after-claim-only"),
      }),
      context(ID)
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ created: true, version: 1 });
    expect(storedRecord(ID)).toMatchObject({
      createdAt: claim.createdAt,
      secretSha256: sha256Hex(secret()),
      version: 1,
    });
    expect(
      new TextDecoder().decode(
        store.get(catalogVersionPath(ID, 1)) as Uint8Array
      )
    ).toBe("ciphertext-after-claim-only");
  });

  test("a different bearer cannot use a claim-only partial create", async () => {
    const claim = {
      createdAt: new Date().toISOString(),
      id: ID,
      secretSha256: sha256Hex(secret()),
    };
    store.set(
      catalogClaimPath(ID),
      new TextEncoder().encode(JSON.stringify(claim))
    );
    const response = await PUT(
      putRequest(ID, {
        authorization: bearer(secret(9)),
        baseVersion: "0",
        body: new TextEncoder().encode("ciphertext-attacker"),
      }),
      context(ID)
    );
    expect(response.status).toBe(401);
    expect(store.get(catalogRecordPath(ID))).toBeUndefined();
    expect(store.get(catalogVersionPath(ID, 1))).toBeUndefined();
  });

  test("malformed or mismatched claims fail safely without promotion", async () => {
    const orphan = new TextEncoder().encode("ciphertext-orphan-no-claim");
    const cases: Array<{ name: string; claimBody: string }> = [
      { claimBody: "not-json{", name: "malformed json" },
      {
        claimBody: JSON.stringify({
          createdAt: new Date().toISOString(),
          id: ID,
        }),
        name: "missing digest",
      },
      {
        claimBody: JSON.stringify({
          createdAt: new Date().toISOString(),
          id: OTHER_ID,
          secretSha256: sha256Hex(secret()),
        }),
        name: "id mismatch",
      },
      {
        claimBody: JSON.stringify({
          createdAt: new Date().toISOString(),
          id: ID,
          secretSha256: "not-a-hash",
        }),
        name: "bad digest format",
      },
    ];
    for (const { claimBody } of cases) {
      store.clear();
      store.set(catalogClaimPath(ID), new TextEncoder().encode(claimBody));
      store.set(catalogVersionPath(ID, 1), orphan);
      // biome-ignore lint/performance/noAwaitInLoops: sequential behavior assertions need ordered PUTs
      const response = await PUT(
        putRequest(ID, {
          authorization: bearer(secret()),
          baseVersion: "0",
          body: new TextEncoder().encode("ciphertext-retry"),
        }),
        context(ID)
      );
      expect(response.status).toBe(503);
      expect(store.get(catalogRecordPath(ID))).toBeUndefined();
      expect(store.get(catalogVersionPath(ID, 1))).toEqual(orphan);
    }
  });

  test("an orphaned version without a claim cannot be promoted", async () => {
    const orphan = new TextEncoder().encode("ciphertext-legacy-orphan");
    store.set(catalogVersionPath(ID, 1), orphan);
    const response = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: new TextEncoder().encode("ciphertext-retry"),
      }),
      context(ID)
    );
    expect(response.status).toBe(503);
    expect(store.get(catalogRecordPath(ID))).toBeUndefined();
    expect(store.get(catalogClaimPath(ID))).toBeUndefined();
    expect(store.get(catalogVersionPath(ID, 1))).toEqual(orphan);
  });

  test("an ID-mismatched stored record fails safely without redirecting", async () => {
    const otherCiphertext = new TextEncoder().encode("ciphertext-other");
    const created = await PUT(
      putRequest(OTHER_ID, {
        authorization: bearer(secret()),
        baseVersion: "0",
        body: otherCiphertext,
      }),
      context(OTHER_ID)
    );
    expect(created.status).toBe(201);
    const otherRecordBefore = new TextDecoder().decode(
      store.get(catalogRecordPath(OTHER_ID)) as Uint8Array
    );
    const otherVersionBefore = store.get(catalogVersionPath(OTHER_ID, 1));

    // Store a syntactically valid record under ID whose id points elsewhere.
    store.set(
      catalogRecordPath(ID),
      store.get(catalogRecordPath(OTHER_ID)) as Uint8Array
    );

    const fetched = await GET(
      new Request(`https://bitplan.dev/api/catalog/${ID}`),
      context(ID)
    );
    expect(fetched.status).toBe(503);
    expect(await fetched.json()).toMatchObject({
      error: "storage-unavailable",
    });

    // The other catalog must still serve its own bytes; the mismatched
    // record must not redirect ID reads to it.
    const otherFetched = await GET(
      new Request(`https://bitplan.dev/api/catalog/${OTHER_ID}`),
      context(OTHER_ID)
    );
    expect(otherFetched.status).toBe(200);
    expect(new Uint8Array(await otherFetched.arrayBuffer())).toEqual(
      otherCiphertext
    );

    const write = await PUT(
      putRequest(ID, {
        authorization: bearer(secret()),
        baseVersion: "1",
        body: new TextEncoder().encode("ciphertext-write-elsewhere"),
      }),
      context(ID)
    );
    expect(write.status).toBe(503);
    expect(await write.json()).toMatchObject({ error: "storage-unavailable" });

    // No write may be redirected to the other catalog, and no claim or
    // version blob may appear under the mismatched ID.
    expect(
      new TextDecoder().decode(
        store.get(catalogRecordPath(OTHER_ID)) as Uint8Array
      )
    ).toBe(otherRecordBefore);
    expect(store.get(catalogVersionPath(OTHER_ID, 1))).toEqual(
      otherVersionBefore
    );
    expect(store.get(catalogClaimPath(ID))).toBeUndefined();
    expect(store.get(catalogVersionPath(ID, 1))).toBeUndefined();
    expect(
      new TextDecoder().decode(store.get(catalogRecordPath(ID)) as Uint8Array)
    ).toBe(otherRecordBefore);
  });

  test("concurrent first writers bind exactly one winner to the immutable claim", async () => {
    const secretA = secret(11);
    const secretB = secret(77);
    const bodyA = new TextEncoder().encode("ciphertext-racer-a");
    const bodyB = new TextEncoder().encode("ciphertext-racer-b");
    expect(new TextDecoder().decode(bodyA)).not.toBe(
      new TextDecoder().decode(bodyB)
    );

    // Start both creates together on the same empty catalog; neither sees
    // pre-seeded state so both contend on the immutable claim.
    const [responseA, responseB] = await Promise.all([
      PUT(
        putRequest(ID, {
          authorization: bearer(secretA),
          baseVersion: "0",
          body: bodyA,
        }),
        context(ID)
      ),
      PUT(
        putRequest(ID, {
          authorization: bearer(secretB),
          baseVersion: "0",
          body: bodyB,
        }),
        context(ID)
      ),
    ]);

    // Exactly one create succeeds; the loser fails authentication.
    expect([responseA.status, responseB.status].sort()).toEqual([201, 401]);
    const winnerIsA = responseA.status === 201;
    const winnerSecret = winnerIsA ? secretA : secretB;
    const winnerBody = winnerIsA ? bodyA : bodyB;
    const loserResponse = winnerIsA ? responseB : responseA;

    expect(await loserResponse.json()).toMatchObject({ error: "bad-secret" });
    const winnerPayload = await (winnerIsA ? responseA : responseB).json();
    expect(winnerPayload).toMatchObject({ created: true, id: ID, version: 1 });

    const record = storedRecord(ID);
    expect(record).toMatchObject({
      bytes: winnerBody.byteLength,
      id: ID,
      secretSha256: sha256Hex(winnerSecret),
      version: 1,
    });
    const claim = JSON.parse(
      new TextDecoder().decode(store.get(catalogClaimPath(ID)) as Uint8Array)
    ) as Record<string, unknown>;
    expect(claim).toMatchObject({
      id: ID,
      secretSha256: sha256Hex(winnerSecret),
    });
    expect(record.createdAt).toBe(claim.createdAt);
    expect(store.get(catalogVersionPath(ID, 1))).toEqual(winnerBody);
  });
});

describe("chunked request bodies", () => {
  test("rejects chunked oversize without content-length and cancels early", async () => {
    const chunk = new Uint8Array(64 * 1024);
    chunk.fill(7);
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
      pull(controller) {
        pulls += 1;
        if (pulls > 100) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
    });
    const request = new Request(`https://bitplan.dev/api/catalog/${ID}`, {
      body: stream as BodyInit,
      duplex: "half",
      headers: {
        authorization: bearer(secret()),
        "content-type": CATALOG_CONTENT_TYPE,
        "x-bitplan-base-version": "0",
      },
      method: "PUT",
    } as RequestInit);
    expect(request.headers.get("content-length")).toBeNull();

    const response = await PUT(request, context(ID));
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(100);
    expect(pulls * chunk.byteLength).toBeGreaterThan(MAX_CATALOG_BYTES);
    expect(store.get(catalogRecordPath(ID))).toBeUndefined();
  });
});

describe("catalog bearer comparison", () => {
  test("matches only the exact bearer through the constant-time path", () => {
    expect(verifyCatalogBearer(secret(), sha256Hex(secret()))).toBe(true);
    expect(verifyCatalogBearer(secret(9), sha256Hex(secret()))).toBe(false);
    expect(verifyCatalogBearer(secret(), "not-a-hash")).toBe(false);
    expect(verifyCatalogBearer(secret(), "0".repeat(64))).toBe(false);
  });
});
