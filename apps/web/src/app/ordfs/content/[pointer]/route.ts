import { parseEnvelope } from "@/lib/envelope";
import { toOrdinalOutpoint } from "@/lib/outpoint";

const BITPLAN_CONTENT_TYPE = "application/x-bitplan";
const DEFAULT_ORDFS_GATEWAY = "https://api.1sat.app";
const DIGITS = /^\d+$/;
const MAX_ENVELOPE_BYTES = 640 * 1024;
const SEQUENCE = /^(?:-2|-1|0|[1-9]\d*)$/;
const TRAILING_SLASHES = /\/+$/;
const SAFE_RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "content-disposition": 'attachment; filename="bitplan-envelope.bin"',
  "content-security-policy": "default-src 'none'; sandbox",
  "content-type": BITPLAN_CONTENT_TYPE,
  "cross-origin-resource-policy": "same-origin",
  "x-content-type-options": "nosniff",
} as const;

interface RouteContext {
  params: Promise<{ pointer: string }>;
}

export function GET(_request: Request, context: RouteContext) {
  return proxyContent("GET", context);
}

export function HEAD(_request: Request, context: RouteContext) {
  return proxyContent("HEAD", context);
}

async function proxyContent(method: "GET" | "HEAD", context: RouteContext) {
  const pointer = parsePointer((await context.params).pointer);
  if (!pointer) {
    return jsonError(
      400,
      "invalid-pointer",
      "Pointer must be txid_vout:seq.",
      "Example: /ordfs/content/<txid>_0:-1"
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${ordfsGateway()}/content/${pointer}`, {
      cache: "no-store",
      method,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return jsonError(
      502,
      "gateway-unreachable",
      "Could not reach the 1Sat content gateway.",
      "Retry shortly, or fetch the origin from the chain directly."
    );
  }
  if (upstream.status === 404) {
    return jsonError(
      404,
      "not-found",
      "No BitPlan inscription at that pointer.",
      "Confirm the origin outpoint and sequence."
    );
  }
  if (!upstream.ok) {
    return jsonError(
      upstream.status,
      "gateway-error",
      `1Sat returned ${upstream.status}.`,
      "Retry shortly."
    );
  }
  if (
    mediaType(upstream.headers.get("content-type")) !== BITPLAN_CONTENT_TYPE
  ) {
    return jsonError(
      502,
      "not-bitplan",
      "That inscription is not a BitPlan envelope.",
      "BitPlan only proxies application/x-bitplan."
    );
  }

  const claimedLength = parseLength(upstream.headers.get("content-length"));
  if (claimedLength !== null && claimedLength > MAX_ENVELOPE_BYTES) {
    return jsonError(
      502,
      "too-large",
      "Envelope is larger than the viewer will fetch.",
      "Use the CLI fetch command for oversized drafts."
    );
  }

  const headers = responseHeaders(upstream.headers);
  if (method === "HEAD") {
    if (claimedLength !== null) {
      headers.set("content-length", String(claimedLength));
    }
    return new Response(null, { headers, status: 200 });
  }

  const bytes = await readLimited(upstream.body, MAX_ENVELOPE_BYTES);
  if (!bytes) {
    return jsonError(
      502,
      "too-large",
      "Envelope is larger than the viewer will fetch.",
      "Use the CLI fetch command for oversized drafts."
    );
  }
  try {
    parseEnvelope(bytes);
  } catch {
    return jsonError(
      502,
      "invalid-envelope",
      "Bytes at that pointer are not a BitPlan envelope.",
      "Confirm the origin is a bitplan draft."
    );
  }

  headers.set("content-length", String(bytes.byteLength));
  return new Response(Uint8Array.from(bytes).buffer, {
    headers,
    status: 200,
  });
}

function parsePointer(value: string): string | null {
  const separator = value.lastIndexOf(":");
  if (separator < 1) {
    return null;
  }
  const sequenceText = value.slice(separator + 1);
  if (!SEQUENCE.test(sequenceText)) {
    return null;
  }
  const sequence = Number(sequenceText);
  if (!Number.isSafeInteger(sequence)) {
    return null;
  }
  try {
    return `${toOrdinalOutpoint(value.slice(0, separator))}:${sequence}`;
  } catch {
    return null;
  }
}

function jsonError(
  status: number,
  error: string,
  message: string,
  hint: string
): Response {
  return Response.json(
    { error, hint, message },
    {
      headers: { "content-type": "application/json; charset=utf-8" },
      status,
    }
  );
}

function ordfsGateway(): string {
  const configured = process.env.NEXT_PUBLIC_ORDFS_GATEWAY_URL?.trim();
  if (!configured) {
    return DEFAULT_ORDFS_GATEWAY;
  }
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_ORDFS_GATEWAY;
    }
    return url.toString().replace(TRAILING_SLASHES, "");
  } catch {
    return DEFAULT_ORDFS_GATEWAY;
  }
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

function responseHeaders(upstream: Headers): Headers {
  const headers = new Headers(SAFE_RESPONSE_HEADERS);
  for (const name of ["x-ord-seq", "x-origin", "x-outpoint"]) {
    const value = upstream.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function readLimited(
  body: ReadableStream<Uint8Array> | null,
  limit: number
): Promise<Uint8Array | null> {
  if (!body) {
    return null;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let finished = false;
  while (!finished) {
    // A ReadableStream must be consumed sequentially.
    // biome-ignore lint/performance/noAwaitInLoops: see above
    const { done, value } = await reader.read();
    if (done) {
      finished = true;
      continue;
    }
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
