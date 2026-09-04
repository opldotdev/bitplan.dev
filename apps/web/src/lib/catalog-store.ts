import { createHash, timingSafeEqual } from "node:crypto";

import { get, head, put } from "@vercel/blob";

import { CATALOG_CONTENT_TYPE, isCatalogId } from "@/lib/catalog-id";

/** Maximum ciphertext body accepted by the catalog endpoint: 600 KiB. */
export const MAX_CATALOG_BYTES = 600 * 1024;

const CATALOG_PREFIX = "catalogs/";
const SECRET_BYTES = 32;
const BEARER = /^Bearer\s+(\S+)$/i;
const BEARER_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface CatalogRecord {
  bytes: number;
  createdAt: string;
  id: string;
  secretSha256: string;
  updatedAt: string;
  version: number;
}

export class CatalogAuthError extends Error {
  constructor(message = "Wrong catalog bearer.", cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "CatalogAuthError";
  }
}

export class CatalogConflictError extends Error {
  readonly current: number;

  constructor(
    message: string,
    options: { cause?: unknown; current: number } = { current: 0 }
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause }
    );
    this.name = "CatalogConflictError";
    this.current = options.current;
  }
}

export class CatalogUnavailableError extends Error {
  constructor(message = "Catalog storage is unavailable.", cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "CatalogUnavailableError";
  }
}

export interface CatalogClaim {
  createdAt: string;
  id: string;
  secretSha256: string;
}

export function catalogRecordPath(id: string): string {
  return `${CATALOG_PREFIX}${id}/record.json`;
}

export function catalogClaimPath(id: string): string {
  return `${CATALOG_PREFIX}${id}/claim.json`;
}

export function catalogVersionPath(id: string, version: number): string {
  return `${CATALOG_PREFIX}${id}/${version}.bin`;
}

/**
 * Parse an `Authorization: Bearer <43-char unpadded-base64url secret>` header.
 * Returns the 32-byte secret, or null when the header is missing or malformed.
 */
export function catalogBearerFromAuthorization(
  header: string | null
): Uint8Array | null {
  if (!header) {
    return null;
  }
  const match = BEARER.exec(header);
  const token = match?.[1];
  if (!token) {
    return null;
  }
  if (!BEARER_TOKEN.test(token)) {
    return null;
  }
  let secret: Buffer;
  try {
    secret = Buffer.from(token, "base64url");
  } catch {
    return null;
  }
  if (secret.byteLength !== SECRET_BYTES) {
    return null;
  }
  return new Uint8Array(secret);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Compare a candidate bearer against a stored SHA-256 hex digest in constant
 * time. Only the hash is ever persisted; the bearer itself is never stored.
 */
export function verifyCatalogBearer(
  candidate: Uint8Array,
  expectedSha256Hex: string
): boolean {
  if (!SHA256_HEX.test(expectedSha256Hex)) {
    return false;
  }
  const expected = Buffer.from(expectedSha256Hex, "hex");
  const actual = createHash("sha256").update(candidate).digest();
  if (expected.byteLength !== actual.byteLength) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

/**
 * Create (base version 0, only when missing) or update (exact current version)
 * a catalog. Create writes the immutable claim with overwrite disabled first,
 * then the immutable version blob, then the current record. Returns the
 * stored record and whether it was created.
 */
export async function putCatalog(
  id: string,
  secret: Uint8Array,
  ciphertext: Uint8Array,
  baseVersion: number
): Promise<{ created: boolean; record: CatalogRecord }> {
  assertCatalogId(id);
  assertSecretLength(secret);
  assertCiphertext(ciphertext);
  assertBaseVersion(baseVersion);

  const existing = await readCatalogRecord(id);

  if (baseVersion === 0) {
    if (existing) {
      throw new CatalogConflictError("Catalog already exists.", {
        current: existing.version,
      });
    }
    const claim = await establishOrVerifyCreateClaim(id, secret);
    try {
      await writeVersionBlob(id, 1, ciphertext);
    } catch (error) {
      throw await toCreateConflict(id, claim, error);
    }
    const record: CatalogRecord = {
      bytes: ciphertext.byteLength,
      createdAt: claim.createdAt,
      id,
      secretSha256: claim.secretSha256,
      updatedAt: claim.createdAt,
      version: 1,
    };
    await writeRecord(record);
    return { created: true, record };
  }

  if (!existing) {
    throw new CatalogConflictError("Catalog version conflict.", { current: 0 });
  }
  if (!verifyCatalogBearer(secret, existing.secretSha256)) {
    throw new CatalogAuthError();
  }
  if (existing.version !== baseVersion) {
    throw new CatalogConflictError("Catalog version conflict.", {
      current: existing.version,
    });
  }
  const nextVersion = existing.version + 1;
  try {
    await writeVersionBlob(id, nextVersion, ciphertext, existing.version);
  } catch (error) {
    throw await toUpdateConflict(id, existing, error);
  }
  const updated: CatalogRecord = {
    ...existing,
    bytes: ciphertext.byteLength,
    updatedAt: new Date().toISOString(),
    version: nextVersion,
  };
  await writeRecord(updated);
  return { created: false, record: updated };
}

export async function readCatalogRecord(
  id: string
): Promise<CatalogRecord | null> {
  if (!isCatalogId(id)) {
    return null;
  }
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(catalogRecordPath(id), {
      access: "private",
      useCache: false,
    });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new CatalogUnavailableError(undefined, error);
  }
  if (result?.statusCode !== 200) {
    return null;
  }
  const text = await new Response(result.stream).text();
  try {
    const parsed = parseRecord(JSON.parse(text));
    if (parsed && parsed.id === id) {
      return parsed;
    }
  } catch {
    // Fall through to the invalid-record error.
  }
  throw new CatalogUnavailableError("Stored catalog record is invalid.");
}

export async function readCatalogVersion(
  record: CatalogRecord
): Promise<Uint8Array | null> {
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(catalogVersionPath(record.id, record.version), {
      access: "private",
      useCache: false,
    });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new CatalogUnavailableError(undefined, error);
  }
  if (result?.statusCode !== 200) {
    return null;
  }
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

function assertCatalogId(id: string): void {
  if (!isCatalogId(id)) {
    throw new RangeError("Not a catalog id.");
  }
}

function assertSecretLength(secret: Uint8Array): void {
  if (secret.byteLength !== SECRET_BYTES) {
    throw new RangeError("Catalog bearer must be 32 bytes.");
  }
}

function assertCiphertext(ciphertext: Uint8Array): void {
  if (ciphertext.byteLength > MAX_CATALOG_BYTES) {
    throw new RangeError("too-large");
  }
}

function assertBaseVersion(baseVersion: number): void {
  if (!Number.isInteger(baseVersion) || baseVersion < 0) {
    throw new RangeError("Invalid base version.");
  }
}

/**
 * Establish the immutable create claim before version 1, or verify the
 * existing claim against the supplied bearer. A matching bearer may
 * continue or recover; a different bearer receives an auth failure and must
 * never promote the orphan or overwrite the claim. Invalid stored claims
 * are storage-unavailable errors. An orphaned version 1 without a valid
 * claim fails safely without creating a new claim.
 */
async function establishOrVerifyCreateClaim(
  id: string,
  secret: Uint8Array
): Promise<CatalogClaim> {
  const stored = await readCreateClaim(id);
  if (stored) {
    if (!verifyCatalogBearer(secret, stored.secretSha256)) {
      throw new CatalogAuthError();
    }
    return stored;
  }
  let orphan: Uint8Array | null;
  try {
    orphan = await readVersionBlobBytes(id, 1);
  } catch (cause) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new CatalogUnavailableError(undefined, cause);
  }
  if (orphan) {
    throw new CatalogUnavailableError("Orphan version without claim.");
  }
  const fresh: CatalogClaim = {
    createdAt: new Date().toISOString(),
    id,
    secretSha256: sha256Hex(secret),
  };
  try {
    await writeClaimBlob(fresh);
    return fresh;
  } catch (error) {
    if (!(error instanceof CatalogConflictError)) {
      throw error;
    }
    const raced = await readCreateClaim(id);
    if (!raced) {
      // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
      throw new CatalogUnavailableError(undefined, error);
    }
    if (!verifyCatalogBearer(secret, raced.secretSha256)) {
      // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
      throw new CatalogAuthError(undefined, error);
    }
    return raced;
  }
}

async function readCreateClaim(id: string): Promise<CatalogClaim | null> {
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(catalogClaimPath(id), {
      access: "private",
      useCache: false,
    });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new CatalogUnavailableError(undefined, error);
  }
  if (result?.statusCode !== 200) {
    return null;
  }
  let text: string;
  try {
    text = await new Response(result.stream).text();
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new CatalogUnavailableError(undefined, error);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new CatalogUnavailableError(
      "Stored catalog claim is invalid.",
      error
    );
  }
  const claim = parseClaim(parsed);
  if (!claim || claim.id !== id) {
    throw new CatalogUnavailableError("Stored catalog claim is invalid.");
  }
  return claim;
}

function parseClaim(value: unknown): CatalogClaim | null {
  if (!isJsonRecord(value)) {
    return null;
  }
  if (!(typeof value.id === "string" && isCatalogId(value.id))) {
    return null;
  }
  if (
    !(
      typeof value.secretSha256 === "string" &&
      SHA256_HEX.test(value.secretSha256)
    )
  ) {
    return null;
  }
  if (typeof value.createdAt !== "string" || value.createdAt.length === 0) {
    return null;
  }
  return {
    createdAt: value.createdAt,
    id: value.id,
    secretSha256: value.secretSha256,
  };
}

async function writeClaimBlob(claim: CatalogClaim): Promise<void> {
  try {
    await put(catalogClaimPath(claim.id), JSON.stringify(claim), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
    });
  } catch (error) {
    if (await claimBlobExists(claim.id)) {
      throw new CatalogConflictError("Catalog claim already exists.", {
        cause: error,
        current: 0,
      });
    }
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new CatalogUnavailableError(undefined, error);
  }
}

async function claimBlobExists(id: string): Promise<boolean> {
  try {
    await head(catalogClaimPath(id));
    return true;
  } catch {
    return false;
  }
}

async function toCreateConflict(
  id: string,
  claim: CatalogClaim,
  error: unknown
): Promise<CatalogConflictError | CatalogUnavailableError> {
  let fresh: CatalogRecord | null;
  try {
    fresh = await readCatalogRecord(id);
  } catch (cause) {
    return new CatalogUnavailableError(undefined, cause);
  }
  if (fresh) {
    return new CatalogConflictError("Catalog already exists.", {
      cause: error,
      current: fresh.version,
    });
  }
  let orphan: Uint8Array | null;
  try {
    orphan = await readVersionBlobBytes(id, 1);
  } catch (cause) {
    return new CatalogUnavailableError(undefined, cause);
  }
  if (!orphan) {
    return new CatalogUnavailableError(undefined, error);
  }
  try {
    const promoted = await promoteCreateOrphan(id, claim, orphan);
    return new CatalogConflictError("Catalog already exists.", {
      cause: error,
      current: promoted.version,
    });
  } catch (cause) {
    return new CatalogUnavailableError(undefined, cause);
  }
}

async function toUpdateConflict(
  id: string,
  existing: CatalogRecord,
  error: unknown
): Promise<CatalogConflictError | CatalogUnavailableError> {
  const current = existing.version;
  let fresh: CatalogRecord | null;
  try {
    fresh = await readCatalogRecord(id);
  } catch (cause) {
    return new CatalogUnavailableError(undefined, cause);
  }
  if (fresh && fresh.version !== current) {
    return new CatalogConflictError("Catalog version conflict.", {
      cause: error,
      current: fresh.version,
    });
  }
  if (!fresh) {
    // Record vanished between reads; fall back to the orphan for the next
    // version when it exists so a partial create does not wedge updates.
    let orphan: Uint8Array | null;
    try {
      orphan = await readVersionBlobBytes(id, current + 1);
    } catch (cause) {
      return new CatalogUnavailableError(undefined, cause);
    }
    if (!orphan) {
      return new CatalogUnavailableError(undefined, error);
    }
    try {
      const promoted = await promoteUpdateOrphan(id, existing, orphan);
      return new CatalogConflictError("Catalog version conflict.", {
        cause: error,
        current: promoted.version,
      });
    } catch (cause) {
      return new CatalogUnavailableError(undefined, cause);
    }
  }
  let orphan: Uint8Array | null;
  try {
    orphan = await readVersionBlobBytes(id, current + 1);
  } catch (cause) {
    return new CatalogUnavailableError(undefined, cause);
  }
  if (!orphan) {
    return new CatalogUnavailableError(undefined, error);
  }
  try {
    const promoted = await promoteUpdateOrphan(id, existing, orphan);
    return new CatalogConflictError("Catalog version conflict.", {
      cause: error,
      current: promoted.version,
    });
  } catch (cause) {
    return new CatalogUnavailableError(undefined, cause);
  }
}

/**
 * Promote an already-written immutable v1 blob as the winning record after
 * a partial create (blob succeeded, record failed). Preserves the claim's
 * original digest and creation time. Never writes the version blob.
 */
async function promoteCreateOrphan(
  id: string,
  claim: CatalogClaim,
  orphan: Uint8Array
): Promise<CatalogRecord> {
  const record: CatalogRecord = {
    bytes: orphan.byteLength,
    createdAt: claim.createdAt,
    id,
    secretSha256: claim.secretSha256,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  await writeRecord(record);
  return record;
}

/**
 * Promote an already-written immutable N+1 blob as the winning record after
 * a partial update. Preserves the existing secret hash/createdAt and binds
 * the record id to the requested id. Never writes the version blob.
 */
async function promoteUpdateOrphan(
  id: string,
  existing: CatalogRecord,
  orphan: Uint8Array
): Promise<CatalogRecord> {
  const promoted: CatalogRecord = {
    bytes: orphan.byteLength,
    createdAt: existing.createdAt,
    id,
    secretSha256: existing.secretSha256,
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
  };
  await writeRecord(promoted);
  return promoted;
}

async function readVersionBlobBytes(
  id: string,
  version: number
): Promise<Uint8Array | null> {
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(catalogVersionPath(id, version), {
      access: "private",
      useCache: false,
    });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new CatalogUnavailableError(undefined, error);
  }
  if (result?.statusCode !== 200) {
    return null;
  }
  try {
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new CatalogUnavailableError(undefined, error);
  }
}

async function versionBlobExists(
  id: string,
  version: number
): Promise<boolean> {
  try {
    await head(catalogVersionPath(id, version));
    return true;
  } catch {
    return false;
  }
}

function parseRecord(value: unknown): CatalogRecord | null {
  if (!isJsonRecord(value)) {
    return null;
  }
  if (!(typeof value.id === "string" && isCatalogId(value.id))) {
    return null;
  }
  if (
    !(
      typeof value.version === "number" &&
      Number.isInteger(value.version) &&
      value.version >= 1
    )
  ) {
    return null;
  }
  if (
    !(
      typeof value.bytes === "number" &&
      Number.isInteger(value.bytes) &&
      value.bytes >= 0
    )
  ) {
    return null;
  }
  if (
    !(
      typeof value.secretSha256 === "string" &&
      SHA256_HEX.test(value.secretSha256)
    )
  ) {
    return null;
  }
  if (
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    bytes: value.bytes,
    createdAt: value.createdAt,
    id: value.id,
    secretSha256: value.secretSha256,
    updatedAt: value.updatedAt,
    version: value.version,
  };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function writeRecord(record: CatalogRecord): Promise<void> {
  try {
    await put(catalogRecordPath(record.id), JSON.stringify(record), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new CatalogUnavailableError(undefined, error);
  }
}

async function writeVersionBlob(
  id: string,
  version: number,
  ciphertext: Uint8Array,
  current?: number
): Promise<void> {
  try {
    await put(catalogVersionPath(id, version), Buffer.from(ciphertext), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: CATALOG_CONTENT_TYPE,
    });
  } catch (error) {
    if (await versionBlobExists(id, version)) {
      throw new CatalogConflictError("Catalog version already exists.", {
        cause: error,
        current: current ?? version,
      });
    }
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new CatalogUnavailableError(undefined, error);
  }
}
