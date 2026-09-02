/** Hosted draft ids: `h_` plus 20 base64url characters. */

export const HOSTED_ID = /^h_[A-Za-z0-9_-]{20}$/;

export function isHostedId(value: string): boolean {
  return HOSTED_ID.test(value);
}

/** `"h_" + base64url(15 random bytes)` — 15 bytes encode to 20 characters. */
export function newHostedId(): string {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  return `h_${toBase64Url(bytes)}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
