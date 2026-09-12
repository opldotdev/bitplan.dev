import { jsonApiError } from "@/lib/api-error";
import { readBoundedRequestBody } from "@/lib/bounded-request-body";
import { CATALOG_CONTENT_TYPE, isCatalogId } from "@/lib/catalog-id";
import {
  CatalogAuthError,
  CatalogConflictError,
  CatalogUnavailableError,
  catalogBearerFromAuthorization,
  MAX_CATALOG_BYTES,
  putCatalog,
  readCatalogRecord,
  readCatalogVersion,
} from "@/lib/catalog-store";

const BASE_VERSION = /^(?:0|[1-9]\d*)$/;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { id } = await context.params;
  if (!isCatalogId(id)) {
    return invalidId();
  }
  try {
    const record = await readCatalogRecord(id);
    if (!record) {
      return notFound();
    }
    const ciphertext = await readCatalogVersion(record);
    if (!ciphertext) {
      return storageUnavailable();
    }
    return new Response(Uint8Array.from(ciphertext).buffer, {
      headers: {
        "cache-control": "private, no-store",
        "content-type": CATALOG_CONTENT_TYPE,
        "x-bitplan-catalog-updated-at": record.updatedAt,
        "x-bitplan-catalog-version": String(record.version),
      },
      status: 200,
    });
  } catch (error) {
    if (error instanceof CatalogUnavailableError) {
      return storageUnavailable();
    }
    return storageUnavailable();
  }
}

export async function PUT(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const { id } = await context.params;
  if (!isCatalogId(id)) {
    return invalidId();
  }
  const secret = catalogBearerFromAuthorization(
    request.headers.get("authorization")
  );
  if (!secret) {
    return badSecret();
  }
  if (mediaType(request.headers.get("content-type")) !== CATALOG_CONTENT_TYPE) {
    return wrongContentType();
  }
  const baseVersion = parseBaseVersion(
    request.headers.get("x-bitplan-base-version")
  );
  if (baseVersion === null) {
    return invalidBaseVersion();
  }

  const ciphertext = await readBoundedRequestBody(request, MAX_CATALOG_BYTES);
  if (!ciphertext) {
    return tooLarge();
  }

  try {
    const { created, record } = await putCatalog(
      id,
      secret,
      ciphertext,
      baseVersion
    );
    return Response.json(
      {
        created,
        id: record.id,
        updatedAt: record.updatedAt,
        version: record.version,
      },
      { status: created ? 201 : 200 }
    );
  } catch (error) {
    if (error instanceof CatalogAuthError) {
      return badSecret();
    }
    if (error instanceof CatalogConflictError) {
      return versionConflict(error.current);
    }
    if (error instanceof RangeError && error.message === "too-large") {
      return tooLarge();
    }
    if (error instanceof CatalogUnavailableError) {
      return storageUnavailable();
    }
    return storageUnavailable();
  }
}

function parseBaseVersion(value: string | null): number | null {
  if (value === null || value === "") {
    return null;
  }
  if (!BASE_VERSION.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function mediaType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function invalidId(): Response {
  return jsonApiError(
    400,
    "invalid-id",
    "That is not a catalog id.",
    "Use the c_ catalog id derived by your wallet."
  );
}

function invalidBaseVersion(): Response {
  return jsonApiError(
    400,
    "invalid-base-version",
    "X-BitPlan-Base-Version must be an integer >= 0.",
    "Send 0 to create, or the exact current version to update."
  );
}

function notFound(): Response {
  return jsonApiError(
    404,
    "not-found",
    "No catalog with that id.",
    "Confirm the catalog id."
  );
}

function badSecret(): Response {
  return jsonApiError(
    401,
    "bad-secret",
    "That bearer does not match this catalog.",
    "Use the write bearer derived by your wallet."
  );
}

function versionConflict(current: number): Response {
  return Response.json(
    {
      code: "version-conflict",
      current,
      error: "version-conflict",
      hint: "Fetch the current version, merge, and publish again.",
      message: "Another publish updated this catalog.",
      status: 409,
    },
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      status: 409,
    }
  );
}

function tooLarge(): Response {
  return jsonApiError(
    413,
    "too-large",
    "Catalog ciphertext is larger than the catalog limit.",
    "Keep the encrypted catalog under 600 KiB."
  );
}

function wrongContentType(): Response {
  return jsonApiError(
    415,
    "wrong-content-type",
    "Catalogs must be application/x-bitplan-catalog.",
    "Set Content-Type: application/x-bitplan-catalog."
  );
}

function storageUnavailable(): Response {
  return jsonApiError(
    503,
    "storage-unavailable",
    "Catalog storage is unavailable.",
    "Retry shortly."
  );
}
