import type { WalletInterface } from "@bsv/sdk";

/**
 * Browser catalog discovery. Uses the same frozen contract as the CLI:
 * protocolID [2, "bitplan catalog"], HMAC keyID catalog-capability-v1,
 * content encryption keyID catalog-content-v1, counterparty self, and the
 * fixed UTF-8 input/labels below. Capability and bearer stay in memory only.
 *
 * The browser only reads the catalog in this release; it never PUTs.
 */

/** Minimal BRC-100 surface catalog discovery needs. */
export type CatalogWallet = Pick<WalletInterface, "createHmac" | "decrypt">;

export const CATALOG_PROTOCOL_ID: [2, "bitplan catalog"] = [
  2,
  "bitplan catalog",
];
export const CATALOG_CAPABILITY_KEY_ID = "catalog-capability-v1";
export const CATALOG_CONTENT_KEY_ID = "catalog-content-v1";
export const CATALOG_COUNTERPARTY = "self";
export const CATALOG_CAPABILITY_INPUT = "bitplan catalog capability v1";
export const CATALOG_LOCATOR_LABEL = "bitplan catalog locator v1";
export const CATALOG_WRITE_LABEL = "bitplan catalog write v1";

import { isCatalogId as matchesCatalogId } from "./catalog-id";

const HOSTED_ID_PATTERN = /^h_[A-Za-z0-9_-]{20}$/;
const CHAIN_ORIGIN_PATTERN = /^[0-9a-fA-F]{64}_[0-9]+$/;

const MAX_CATALOG_PLAINTEXT_BYTES = 512 * 1024;
const MAX_CATALOG_ENTRIES = 1000;
const MAX_TITLE_CHARS = 512;
const MAX_DESCRIPTION_CHARS = 1000;
const MAX_REPO_HOST_CHARS = 253;
const MAX_REPO_ORG_CHARS = 255;
const MAX_REPO_NAME_CHARS = 255;

export class CatalogError extends Error {
  override readonly name: string = "CatalogError";
}

export class CatalogValidationError extends CatalogError {
  override readonly name: string = "CatalogValidationError";
}

export interface CatalogEntry {
  chainOrigin: string | null;
  description: string | null;
  id: string;
  repoHost: string | null;
  repoName: string | null;
  repoOrg: string | null;
  state: "hosted" | "inscribed";
  title: string | null;
  updatedAt: string;
  version: number;
}

export interface Catalog {
  entries: CatalogEntry[];
  schema: 1;
}

export type CatalogFetch =
  | { state: "found"; ciphertext: Uint8Array }
  | { state: "missing" }
  | { state: "error"; reason: "network" | "http"; status?: number };

export type CatalogLoad =
  | { state: "ready"; catalogId: string; catalog: Catalog }
  | { state: "missing"; catalogId: string }
  | {
      state: "error";
      catalogId: string | null;
      reason: "derive" | "fetch" | "decrypt" | "schema";
      status?: number;
    };

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function toBase64UrlNoPad(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

async function hmacSha256(
  keyBytes: Uint8Array,
  dataBytes: Uint8Array
): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  return new Uint8Array(
    await globalThis.crypto.subtle.sign("HMAC", key, toArrayBuffer(dataBytes))
  );
}

/** `c_` + unpadded base64url HMAC-SHA256(capability, locator label). */
export async function deriveCatalogIdFromCapability(
  rootCapability: Uint8Array
): Promise<string> {
  const bytes = await hmacSha256(
    rootCapability,
    utf8Bytes(CATALOG_LOCATOR_LABEL)
  );
  return `c_${toBase64UrlNoPad(bytes)}`;
}

/** Unpadded base64url HMAC-SHA256(capability, write label). Memory only. */
export async function deriveWriteBearerFromCapability(
  rootCapability: Uint8Array
): Promise<string> {
  const bytes = await hmacSha256(
    rootCapability,
    utf8Bytes(CATALOG_WRITE_LABEL)
  );
  return toBase64UrlNoPad(bytes);
}

/**
 * Derive the catalog ID through the connected BRC-100 wallet with the exact
 * frozen inputs the CLI HTTP-wallet path uses.
 */
export async function deriveCatalogId(wallet: CatalogWallet): Promise<string> {
  let hmac: readonly number[];
  try {
    ({ hmac } = await wallet.createHmac({
      counterparty: CATALOG_COUNTERPARTY,
      data: Array.from(utf8Bytes(CATALOG_CAPABILITY_INPUT)),
      keyID: CATALOG_CAPABILITY_KEY_ID,
      protocolID: [CATALOG_PROTOCOL_ID[0], CATALOG_PROTOCOL_ID[1]],
    }));
  } catch (error) {
    throw new CatalogError(
      `The wallet refused the catalog capability request: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  if (hmac.length !== 32) {
    throw new CatalogError(
      `The wallet returned a ${hmac.length}-byte catalog capability; expected 32.`
    );
  }
  return deriveCatalogIdFromCapability(Uint8Array.from(hmac));
}

/** True when the connected wallet exposes the catalog read surface. */
export function hasCatalogSupport(wallet: {
  createHmac?: unknown;
  decrypt?: unknown;
}): wallet is CatalogWallet {
  return (
    typeof wallet.createHmac === "function" &&
    typeof wallet.decrypt === "function"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  what: string
): void {
  const actual = Object.keys(value);
  if (
    actual.length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  ) {
    throw new CatalogValidationError(
      `Invalid catalog: ${what} must have exactly keys ${keys.join(", ")}.`
    );
  }
}

function assertBoundedString(
  value: unknown,
  field: string,
  maxChars: number
): asserts value is string | null {
  if (value === null) {
    return;
  }
  if (typeof value !== "string" || [...value].length > maxChars) {
    throw new CatalogValidationError(
      `Invalid catalog: entry.${field} must be null or a string of at most ${maxChars} characters.`
    );
  }
}

/**
 * Strictly validate decrypted catalog JSON. Rejects unknown keys, duplicate
 * hosted IDs, out-of-shape origins, unbounded strings, and bad timestamps.
 */
export function parseCatalogBytes(bytes: Uint8Array): Catalog {
  if (bytes.byteLength > MAX_CATALOG_PLAINTEXT_BYTES) {
    throw new CatalogValidationError(
      `Invalid catalog: plaintext is ${bytes.byteLength} bytes (max ${MAX_CATALOG_PLAINTEXT_BYTES}).`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new CatalogValidationError("Invalid catalog: not valid JSON.", {
      cause: error,
    });
  }
  if (!isRecord(parsed)) {
    throw new CatalogValidationError(
      "Invalid catalog: top level is not an object."
    );
  }
  assertExactKeys(parsed, ["entries", "schema"], "catalog");
  if (parsed.schema !== 1) {
    throw new CatalogValidationError("Invalid catalog: schema must be 1.");
  }
  if (!Array.isArray(parsed.entries)) {
    throw new CatalogValidationError(
      "Invalid catalog: entries must be an array."
    );
  }
  if (parsed.entries.length > MAX_CATALOG_ENTRIES) {
    throw new CatalogValidationError(
      `Invalid catalog: ${parsed.entries.length} entries (max ${MAX_CATALOG_ENTRIES}).`
    );
  }
  const seen = new Set<string>();
  const entries = parsed.entries.map(
    (item, index): CatalogEntry => parseCatalogEntry(item, index, seen)
  );
  return { entries, schema: 1 };
}

const ENTRY_KEYS = [
  "chainOrigin",
  "description",
  "id",
  "repoHost",
  "repoName",
  "repoOrg",
  "state",
  "title",
  "updatedAt",
  "version",
];

function parseCatalogEntry(
  item: unknown,
  index: number,
  seen: Set<string>
): CatalogEntry {
  if (!isRecord(item)) {
    throw new CatalogValidationError(
      `Invalid catalog: entries[${index}] is not an object.`
    );
  }
  assertExactKeys(item, ENTRY_KEYS, `entries[${index}]`);
  if (typeof item.id !== "string" || !HOSTED_ID_PATTERN.test(item.id)) {
    throw new CatalogValidationError(
      `Invalid catalog: entries[${index}].id must be a hosted id.`
    );
  }
  if (seen.has(item.id)) {
    throw new CatalogValidationError(
      `Invalid catalog: duplicate hosted id ${item.id}.`
    );
  }
  seen.add(item.id);
  const state = parseEntryState(item.state, index);
  const chainOrigin = parseEntryChainOrigin(item.chainOrigin, state, index);
  assertBoundedString(item.title, "title", MAX_TITLE_CHARS);
  assertBoundedString(item.description, "description", MAX_DESCRIPTION_CHARS);
  assertBoundedString(item.repoHost, "repoHost", MAX_REPO_HOST_CHARS);
  assertBoundedString(item.repoOrg, "repoOrg", MAX_REPO_ORG_CHARS);
  assertBoundedString(item.repoName, "repoName", MAX_REPO_NAME_CHARS);
  if (!Number.isInteger(item.version) || (item.version as number) < 1) {
    throw new CatalogValidationError(
      `Invalid catalog: entries[${index}].version must be an integer >= 1.`
    );
  }
  if (
    typeof item.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(item.updatedAt))
  ) {
    throw new CatalogValidationError(
      `Invalid catalog: entries[${index}].updatedAt must be a valid ISO timestamp.`
    );
  }
  return {
    chainOrigin,
    description: item.description as string | null,
    id: item.id,
    repoHost: item.repoHost as string | null,
    repoName: item.repoName as string | null,
    repoOrg: item.repoOrg as string | null,
    state,
    title: item.title as string | null,
    updatedAt: item.updatedAt,
    version: item.version as number,
  };
}

function parseEntryState(
  state: unknown,
  index: number
): "hosted" | "inscribed" {
  if (state !== "hosted" && state !== "inscribed") {
    throw new CatalogValidationError(
      `Invalid catalog: entries[${index}].state must be "hosted" or "inscribed".`
    );
  }
  return state;
}

function parseEntryChainOrigin(
  chainOrigin: unknown,
  state: "hosted" | "inscribed",
  index: number
): string | null {
  if (state === "hosted") {
    if (chainOrigin !== null) {
      throw new CatalogValidationError(
        `Invalid catalog: entries[${index}].chainOrigin must be null while hosted.`
      );
    }
    return null;
  }
  if (
    typeof chainOrigin !== "string" ||
    !CHAIN_ORIGIN_PATTERN.test(chainOrigin)
  ) {
    throw new CatalogValidationError(
      `Invalid catalog: entries[${index}].chainOrigin must be a txid_vout origin once inscribed.`
    );
  }
  return chainOrigin;
}

/**
 * GET the current encrypted catalog. Only a confirmed 404 means "missing";
 * every other failure is a retryable error and must never trigger a write.
 */
export async function fetchCatalogCiphertext(
  catalogId: string
): Promise<CatalogFetch> {
  if (!matchesCatalogId(catalogId)) {
    throw new CatalogError("Refusing to fetch a malformed catalog id.");
  }
  let response: Response;
  try {
    response = await fetch(`/api/catalog/${catalogId}`, { cache: "no-store" });
  } catch {
    return { reason: "network", state: "error" };
  }
  if (response.status === 404) {
    return { state: "missing" };
  }
  if (!response.ok) {
    return { reason: "http", state: "error", status: response.status };
  }
  try {
    return {
      ciphertext: new Uint8Array(await response.arrayBuffer()),
      state: "found",
    };
  } catch {
    return { reason: "network", state: "error" };
  }
}

async function decryptCatalogBytes(
  wallet: CatalogWallet,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  let plaintext: readonly number[];
  try {
    ({ plaintext } = await wallet.decrypt({
      ciphertext: Array.from(ciphertext),
      counterparty: CATALOG_COUNTERPARTY,
      keyID: CATALOG_CONTENT_KEY_ID,
      protocolID: [CATALOG_PROTOCOL_ID[0], CATALOG_PROTOCOL_ID[1]],
    }));
  } catch (error) {
    throw new CatalogError(
      `This wallet could not decrypt the catalog: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  return Uint8Array.from(plaintext);
}

/**
 * Derive, fetch, decrypt, and strictly validate the hosted catalog. Never
 * writes. Only a confirmed 404 resolves to "missing".
 */
export async function loadCatalog(wallet: CatalogWallet): Promise<CatalogLoad> {
  let catalogId: string;
  try {
    catalogId = await deriveCatalogId(wallet);
  } catch {
    return { catalogId: null, reason: "derive", state: "error" };
  }
  const fetched = await fetchCatalogCiphertext(catalogId);
  if (fetched.state === "missing") {
    return { catalogId, state: "missing" };
  }
  if (fetched.state === "error") {
    return {
      catalogId,
      reason: "fetch",
      state: "error",
      status: fetched.status,
    };
  }
  let plaintext: Uint8Array;
  try {
    plaintext = await decryptCatalogBytes(wallet, fetched.ciphertext);
  } catch {
    return { catalogId, reason: "decrypt", state: "error" };
  }
  try {
    return {
      catalog: parseCatalogBytes(plaintext),
      catalogId,
      state: "ready",
    };
  } catch {
    return { catalogId, reason: "schema", state: "error" };
  }
}
