/** Hosted catalog ids: `c_` plus 43 unpadded-base64url characters (32 bytes). */

export const CATALOG_CONTENT_TYPE = "application/x-bitplan-catalog" as const;

const CATALOG_ID = /^c_[A-Za-z0-9_-]{43}$/;

export function isCatalogId(value: string): boolean {
  return CATALOG_ID.test(value);
}
