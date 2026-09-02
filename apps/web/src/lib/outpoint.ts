/**
 * Two outpoint spellings:
 *
 *   - `txid.vout`  — BRC-100 wallet outputs
 *   - `txid_vout`  — ordinals indexers, ORDFS keys, and viewer URLs
 *
 * The viewer stores and displays the ordinal (`_`) form. Hosted draft ids
 * (`h_…`) are not outpoints; `normalizeOrigin` still accepts them.
 */

import { isHostedId } from "@/lib/hosted-id";

const TXID_HEX = /^[0-9a-f]{64}$/i;

/** `txid_vout`. Accepts either spelling. */
export function toOrdinalOutpoint(outpoint: string): string {
  const { txid, vout } = splitOutpoint(outpoint);
  return `${txid}_${vout}`;
}

export function splitOutpoint(outpoint: string): {
  txid: string;
  vout: number;
} {
  const trimmed = outpoint.trim();
  const separator = trimmed.length > 64 ? trimmed[64] : undefined;
  if (separator !== "." && separator !== "_") {
    throw new Error(`Not an outpoint: ${outpoint}`);
  }
  const txid = trimmed.slice(0, 64);
  const vout = Number.parseInt(trimmed.slice(65), 10);
  if (!(TXID_HEX.test(txid) && Number.isInteger(vout)) || vout < 0) {
    throw new Error(`Not an outpoint: ${outpoint}`);
  }
  return { txid: txid.toLowerCase(), vout };
}

export function isOutpoint(value: string): boolean {
  try {
    splitOutpoint(value);
    return true;
  } catch {
    return false;
  }
}

/** Normalize a viewer path segment, or `null` if it is not an origin. */
export function normalizeOrigin(value: string): string | null {
  const decoded = decodeURIComponent(value);
  if (isHostedId(decoded)) {
    return decoded;
  }
  try {
    return toOrdinalOutpoint(decoded);
  } catch {
    return null;
  }
}
