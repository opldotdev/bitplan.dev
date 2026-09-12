/**
 * Throwaway reader-link secrets. The public half is an ordinary envelope
 * slot; the private half lives in `#k=` and never leaves the browser.
 */

import { PrivateKey, ProtoWallet, Utils } from "@bsv/sdk";

import type { EnvelopeWallet } from "@/lib/envelope";

const LINK_SECRET_BYTES = 32;

/** Copying a reader link must not accidentally grant collaboration authority. */
export function readerOnlyUrl(value: string): string {
  const url = new URL(value);
  const source = new URLSearchParams(url.hash.slice(1));
  const fragment = new URLSearchParams();
  const key = source.get("k");
  if (source.getAll("k").length === 1 && key && parseLinkFragment(url.href)) {
    fragment.set("k", key);
  }
  url.hash = fragment.toString();
  return url.href;
}

/** Parse `#k=...`, `k=...`, or a full URL. Returns 64 lowercase hex or null. Only exactly 32 bytes are accepted. */
export function parseLinkFragment(input: string): string | null {
  const encoded = encodedSecret(input);
  if (encoded === null) {
    return null;
  }
  const bytes = decodeBase64Url(encoded);
  if (bytes === null || bytes.length !== LINK_SECRET_BYTES) {
    return null;
  }
  return Utils.toHex(bytes);
}

/** `new ProtoWallet(PrivateKey.fromHex(secretHex))` narrowed to EnvelopeWallet. */
export function linkWallet(secretHex: string): EnvelopeWallet {
  return new ProtoWallet(PrivateKey.fromHex(secretHex));
}

function encodedSecret(input: string): string | null {
  let fragment = input;
  try {
    fragment = new URL(input).hash;
  } catch {
    // `#k=...` or `k=...`, not a full URL
  }
  if (fragment.startsWith("#")) {
    fragment = fragment.slice(1);
  }
  const params = new URLSearchParams(fragment);
  if (params.getAll("k").length !== 1) {
    return null;
  }
  return params.get("k") || null;
}

function decodeBase64Url(value: string): Uint8Array | null {
  const translated = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = translated.padEnd(
    translated.length + ((4 - (translated.length % 4)) % 4),
    "="
  );
  try {
    return Uint8Array.from(Utils.toArray(padded, "base64"));
  } catch {
    return null;
  }
}
