import { jsonApiError } from "@/lib/api-error";
import {
  createHosted,
  HostedUnavailableError,
  hostedSecretFromAuthorization,
  hostedViewerUrl,
} from "@/lib/hosted";
import { BITPLAN_CONTENT_TYPE } from "@/lib/ordfs";

const MAX_ENVELOPE_BYTES = 5 * 1024 * 1024 + 256 * 1024;
const DIGITS = /^\d+$/;

export async function POST(request: Request): Promise<Response> {
  const secret = hostedSecretFromAuthorization(
    request.headers.get("authorization")
  );
  if (!secret) {
    return jsonApiError(
      401,
      "missing-secret",
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

  try {
    const record = await createHosted(secret, envelope);
    return Response.json(
      {
        id: record.id,
        version: 1,
        viewer: hostedViewerUrl(record.id),
      },
      { status: 201 }
    );
  } catch (error) {
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
