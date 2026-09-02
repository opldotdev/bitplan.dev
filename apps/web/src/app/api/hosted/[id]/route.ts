import { jsonApiError } from "@/lib/api-error";
import {
  appendHostedVersion,
  HostedAuthError,
  HostedConflictError,
  HostedUnavailableError,
  hostedSecretFromAuthorization,
  hostedViewerUrl,
  isHostedId,
  markInscribed,
  readHostedRecord,
} from "@/lib/hosted";
import { BITPLAN_CONTENT_TYPE } from "@/lib/ordfs";
import { toOrdinalOutpoint } from "@/lib/outpoint";

const MAX_ENVELOPE_BYTES = 5 * 1024 * 1024 + 256 * 1024;
const DIGITS = /^\d+$/;
const BASE_VERSION = /^(?:0|[1-9]\d*)$/;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { id } = await context.params;
  if (!isHostedId(id)) {
    return notFound();
  }
  try {
    const record = await readHostedRecord(id);
    if (!record) {
      return notFound();
    }
    return Response.json({
      bytes: record.bytes,
      createdAt: record.createdAt,
      id: record.id,
      origin: record.origin,
      updatedAt: record.updatedAt,
      versions: record.versions,
    });
  } catch (error) {
    if (error instanceof HostedUnavailableError) {
      return storageUnavailable();
    }
    return storageUnavailable();
  }
}

export async function POST(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const { id } = await context.params;
  if (!isHostedId(id)) {
    return notFound();
  }
  const secret = hostedSecretFromAuthorization(
    request.headers.get("authorization")
  );
  if (!secret) {
    return jsonApiError(
      401,
      "bad-secret",
      "Authorization Bearer token is required.",
      "Send Authorization: Bearer <base64url of the 32-byte secret>."
    );
  }
  if (mediaType(request.headers.get("content-type")) !== BITPLAN_CONTENT_TYPE) {
    return jsonApiError(
      415,
      "wrong-content-type",
      "Hosted drafts must be application/x-bitplan.",
      "Set Content-Type: application/x-bitplan."
    );
  }

  const envelope = await readEnvelope(request);
  if (envelope instanceof Response) {
    return envelope;
  }

  const baseVersion = parseBaseVersion(
    request.headers.get("x-bitplan-base-version")
  );

  try {
    const existing = await readHostedRecord(id);
    if (!existing) {
      return notFound();
    }
    const record = await appendHostedVersion(id, secret, envelope, baseVersion);
    return Response.json({
      id: record.id,
      version: record.versions,
      viewer: hostedViewerUrl(record.id),
    });
  } catch (error) {
    return writeError(error);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const { id } = await context.params;
  if (!isHostedId(id)) {
    return notFound();
  }
  const secret = hostedSecretFromAuthorization(
    request.headers.get("authorization")
  );
  if (!secret) {
    return jsonApiError(
      401,
      "bad-secret",
      "Authorization Bearer token is required.",
      "Send Authorization: Bearer <base64url of the 32-byte secret>."
    );
  }
  if (mediaType(request.headers.get("content-type")) !== "application/json") {
    return jsonApiError(
      415,
      "wrong-content-type",
      "Inscribe must send application/json.",
      'Send { "origin": "<txid>_<vout>" }.'
    );
  }

  let origin: string;
  try {
    const body: unknown = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("origin" in body) ||
      typeof body.origin !== "string"
    ) {
      return invalidOrigin();
    }
    origin = toOrdinalOutpoint(body.origin);
  } catch {
    return invalidOrigin();
  }

  try {
    const existing = await readHostedRecord(id);
    if (!existing) {
      return notFound();
    }
    const record = await markInscribed(id, secret, origin);
    return Response.json({ id: record.id, origin: record.origin });
  } catch (error) {
    if (error instanceof HostedAuthError) {
      return badSecret();
    }
    if (error instanceof HostedConflictError && error.inscribed) {
      return alreadyInscribed();
    }
    if (error instanceof HostedUnavailableError) {
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

function writeError(error: unknown): Response {
  if (error instanceof HostedAuthError) {
    return badSecret();
  }
  if (error instanceof HostedConflictError) {
    if (error.inscribed) {
      return alreadyInscribed();
    }
    return versionConflict(error.current ?? 0);
  }
  if (error instanceof RangeError && error.message === "too-large") {
    return tooLarge();
  }
  if (error instanceof RangeError && error.message === "invalid-envelope") {
    return invalidEnvelope();
  }
  if (error instanceof HostedUnavailableError) {
    return storageUnavailable();
  }
  return storageUnavailable();
}

async function readEnvelope(request: Request): Promise<Uint8Array | Response> {
  const claimed = parseLength(request.headers.get("content-length"));
  if (claimed !== null && claimed > MAX_ENVELOPE_BYTES) {
    return tooLarge();
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_ENVELOPE_BYTES) {
    return tooLarge();
  }
  return bytes;
}

function mediaType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function parseLength(value: string | null): number | null {
  if (!(value && DIGITS.test(value))) {
    return null;
  }
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : null;
}

function notFound(): Response {
  return jsonApiError(
    404,
    "not-found",
    "No hosted draft with that id.",
    "Confirm the hosted id."
  );
}

function badSecret(): Response {
  return jsonApiError(
    401,
    "bad-secret",
    "That secret does not match this hosted draft.",
    "Use the secret returned when the draft was created."
  );
}

function alreadyInscribed(): Response {
  return jsonApiError(
    409,
    "already-inscribed",
    "This hosted draft is already on the chain.",
    "Use the chain origin."
  );
}

function versionConflict(current: number): Response {
  return Response.json(
    {
      code: "version-conflict",
      current,
      error: "version-conflict",
      hint: "Fetch the current version, merge, and publish again.",
      message: "Another publish updated this hosted draft.",
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

function invalidOrigin(): Response {
  return jsonApiError(
    400,
    "invalid-origin",
    "origin must be a chain outpoint.",
    'Send { "origin": "<txid>_<vout>" }.'
  );
}

function tooLarge(): Response {
  return jsonApiError(
    413,
    "too-large",
    "Envelope is larger than the hosted limit.",
    "Keep the sealed envelope under 5 MB plus framing."
  );
}

function invalidEnvelope(): Response {
  return jsonApiError(
    400,
    "invalid-envelope",
    "Bytes are not a BitPlan envelope.",
    "Seal the plan with the BitPlan CLI before uploading."
  );
}

function storageUnavailable(): Response {
  return jsonApiError(
    503,
    "storage-unavailable",
    "Hosted draft storage is unavailable.",
    "Retry shortly."
  );
}
