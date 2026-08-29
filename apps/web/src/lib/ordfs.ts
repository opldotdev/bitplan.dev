import { toOrdinalOutpoint } from "@/lib/outpoint";

/**
 * Same-origin ORDFS proxy. next.config.ts rewrites `/ordfs/:path*` to
 * `https://ordfs.network/:path*` so the browser can read `x-outpoint`,
 * `x-origin`, and `x-ord-seq` (ordfs.network CORS does not expose them).
 */
export const ORDFS_PROXY = "/ordfs";

export interface OrdfsContent {
  bytes: Uint8Array;
  contentType: string;
  origin: string | null;
  /** Outpoint the content was actually served from. */
  outpoint: string | null;
  /** Position in the transfer chain, when ORDFS reports one. */
  sequence: number | null;
}

export function ordfsContentUrl(origin: string, seq: number): string {
  const pointer = toOrdinalOutpoint(origin);
  return `${ORDFS_PROXY}/content/${pointer}:${seq}`;
}

/**
 * Fetch inscription bytes for an origin chain.
 *
 * `seq` -1 = latest tip, -2 = origin, N = Nth state (0-based).
 * Returns `null` on 404 or any other unsuccessful response.
 */
export async function fetchOrdfsContent(
  origin: string,
  seq: number
): Promise<OrdfsContent | null> {
  const url = ordfsContentUrl(origin, seq);

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const buffer = await response.arrayBuffer();
  const sequenceHeader = response.headers.get("x-ord-seq");
  const parsedSequence = sequenceHeader
    ? Number.parseInt(sequenceHeader, 10)
    : Number.NaN;

  return {
    bytes: new Uint8Array(buffer),
    contentType:
      response.headers.get("content-type") ?? "application/octet-stream",
    origin: response.headers.get("x-origin"),
    outpoint: response.headers.get("x-outpoint"),
    sequence: Number.isFinite(parsedSequence) ? parsedSequence : null,
  };
}
