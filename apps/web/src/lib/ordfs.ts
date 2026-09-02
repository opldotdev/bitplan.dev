import { parseEnvelope } from "@/lib/envelope";
import { isHostedId } from "@/lib/hosted-id";
import { toOrdinalOutpoint } from "@/lib/outpoint";
import { SITE_URL } from "@/lib/site";

const TRAILING_SLASHES = /\/+$/;

/**
 * Same-origin content proxy. A narrow Route Handler accepts only GET/HEAD for
 * validated BitPlan content pointers, then returns inert envelope bytes.
 */
export const ORDFS_PROXY = "/ordfs";

/** Absolute gateway for server-side reads (OG images, metadata). */
export const ORDFS_GATEWAY = configuredOrdfsGateway();

export const BITPLAN_CONTENT_TYPE = "application/x-bitplan";

function configuredOrdfsGateway(): string {
  const configured = process.env.NEXT_PUBLIC_ORDFS_GATEWAY_URL;
  if (!configured) {
    return "https://api.1sat.app";
  }
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "https://api.1sat.app";
    }
    return url.toString().replace(TRAILING_SLASHES, "");
  } catch {
    return "https://api.1sat.app";
  }
}

export interface OrdfsContent {
  bytes: Uint8Array;
  contentType: string;
  origin: string | null;
  /** Outpoint the content was actually served from. */
  outpoint: string | null;
  /** Position in the transfer chain, when ORDFS reports one. */
  sequence: number | null;
}

export type OrdfsContentResult =
  | { state: "found"; content: OrdfsContent }
  | { state: "not-found" }
  | { state: "network-error" }
  | { state: "server-error"; status: number }
  | { state: "request-error"; status: number }
  | {
      state: "invalid-content";
      reason: "content-type" | "envelope";
      contentType: string;
    };

function mediaType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function ordfsContentUrl(origin: string, seq: number): string {
  const pointer = isHostedId(origin) ? origin : toOrdinalOutpoint(origin);
  return `${ORDFS_PROXY}/content/${pointer}:${seq}`;
}

export function ordfsGatewayContentUrl(origin: string, seq: number): string {
  const pointer = toOrdinalOutpoint(origin);
  return `${ORDFS_GATEWAY}/content/${pointer}:${seq}`;
}

export interface OrdfsMeta {
  byteLength: number | null;
  contentType: string;
  origin: string | null;
  outpoint: string | null;
  sequence: number | null;
}

/**
 * Public envelope headers only. HEAD, no body: ciphertext never enters the
 * process. Used by share cards so a `/d/[origin]` URL can describe the draft
 * without decrypting it.
 */
export async function fetchOrdfsMeta(
  origin: string,
  seq: number
): Promise<OrdfsMeta | null> {
  const url = isHostedId(origin)
    ? `${SITE_URL}${ordfsContentUrl(origin, seq)}`
    : ordfsGatewayContentUrl(origin, seq);

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", method: "HEAD" });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const lengthHeader = response.headers.get("content-length");
  const parsedLength = lengthHeader
    ? Number.parseInt(lengthHeader, 10)
    : Number.NaN;
  const sequenceHeader = response.headers.get("x-ord-seq");
  const parsedSequence = sequenceHeader
    ? Number.parseInt(sequenceHeader, 10)
    : Number.NaN;

  return {
    byteLength: Number.isFinite(parsedLength) ? parsedLength : null,
    contentType:
      response.headers.get("content-type") ?? "application/octet-stream",
    origin: response.headers.get("x-origin"),
    outpoint: response.headers.get("x-outpoint"),
    sequence: Number.isFinite(parsedSequence) ? parsedSequence : null,
  };
}

/**
 * Fetch inscription bytes for an origin chain.
 *
 * `seq` -1 = latest tip, -2 = origin, N = Nth state (0-based).
 * Distinguishes an absent inscription from connectivity, gateway, and content
 * validation failures so callers never present an outage as a missing draft.
 */
export async function fetchOrdfsContent(
  origin: string,
  seq: number
): Promise<OrdfsContentResult> {
  const url = ordfsContentUrl(origin, seq);

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    return { state: "network-error" };
  }

  if (response.status === 404) {
    return { state: "not-found" };
  }
  if (response.status >= 500) {
    return { state: "server-error", status: response.status };
  }
  if (!response.ok) {
    return { state: "request-error", status: response.status };
  }

  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  if (mediaType(contentType) !== BITPLAN_CONTENT_TYPE) {
    return {
      contentType,
      reason: "content-type",
      state: "invalid-content",
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    return { state: "network-error" };
  }

  try {
    parseEnvelope(bytes);
  } catch {
    return {
      contentType,
      reason: "envelope",
      state: "invalid-content",
    };
  }

  const sequenceHeader = response.headers.get("x-ord-seq");
  const parsedSequence = sequenceHeader
    ? Number.parseInt(sequenceHeader, 10)
    : Number.NaN;

  return {
    content: {
      bytes,
      contentType,
      origin: response.headers.get("x-origin"),
      outpoint: response.headers.get("x-outpoint"),
      sequence: Number.isFinite(parsedSequence) ? parsedSequence : null,
    },
    state: "found",
  };
}
