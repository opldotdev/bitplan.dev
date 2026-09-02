import { Hash, Utils } from "@bsv/sdk";
import { get, head, put } from "@vercel/blob";

import { parseEnvelope } from "@/lib/envelope";
import {
  newHostedId as allocateHostedId,
  HOSTED_ID as hostedIdPattern,
  isHostedId as matchHostedId,
} from "@/lib/hosted-id";
import { SITE_URL } from "@/lib/site";

export const HOSTED_ID = hostedIdPattern;

export function isHostedId(value: string): boolean {
  return matchHostedId(value);
}

export function newHostedId(): string {
  return allocateHostedId();
}

const HOSTED_PREFIX = "hosted/";
const MAX_ENVELOPE_BYTES = 5 * 1024 * 1024 + 256 * 1024;
const SECRET_BYTES = 32;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const BEARER = /^Bearer\s+(\S+)$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface HostedRecord {
  bytes: number[];
  createdAt: string;
  id: string;
  origin: string | null;
  secretSha256: string;
  updatedAt: string;
  versions: number;
}

export class HostedAuthError extends Error {
  constructor(message = "Wrong hosted secret.", cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "HostedAuthError";
  }
}

export class HostedConflictError extends Error {
  readonly current: number | undefined;
  readonly inscribed: boolean;

  constructor(
    message: string,
    options: { cause?: unknown; current?: number; inscribed?: boolean } = {}
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause }
    );
    this.name = "HostedConflictError";
    this.current = options.current;
    this.inscribed = options.inscribed === true;
  }
}

export class HostedUnavailableError extends Error {
  constructor(
    message = "Hosted draft storage is unavailable.",
    cause?: unknown
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "HostedUnavailableError";
  }
}

export function recordPath(id: string): string {
  return `${HOSTED_PREFIX}${id}/record.json`;
}

export function versionPath(id: string, n: number): string {
  return `${HOSTED_PREFIX}${id}/${n}.bpln`;
}

export function hostedViewerUrl(id: string): string {
  return `${SITE_URL}/d/${id}`;
}

export function hostedSecretFromAuthorization(
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
  const secret = decodeBase64Url(token);
  if (!secret || secret.byteLength !== SECRET_BYTES) {
    return null;
  }
  return secret;
}

export async function createHosted(
  secret: Uint8Array,
  envelope: Uint8Array
): Promise<HostedRecord> {
  assertSecretLength(secret);
  assertEnvelope(envelope);
  const id = newHostedId();
  const now = new Date().toISOString();
  const record: HostedRecord = {
    bytes: [envelope.byteLength],
    createdAt: now,
    id,
    origin: null,
    secretSha256: sha256Hex(secret),
    updatedAt: now,
    versions: 1,
  };
  await writeVersionBlob(id, 1, envelope);
  await writeRecord(record);
  return record;
}

export async function appendHostedVersion(
  id: string,
  secret: Uint8Array,
  envelope: Uint8Array,
  baseVersion: number | null
): Promise<HostedRecord> {
  assertHostedId(id);
  assertSecretLength(secret);
  assertEnvelope(envelope);
  const record = await readHostedRecord(id);
  if (!record) {
    throw new HostedUnavailableError("Hosted draft not found.");
  }
  assertSecret(secret, record);
  if (record.origin !== null) {
    throw new HostedConflictError("This hosted draft is already inscribed.", {
      inscribed: true,
    });
  }
  if (baseVersion !== null && baseVersion !== record.versions) {
    throw new HostedConflictError("Hosted draft version conflict.", {
      current: record.versions,
    });
  }
  const nextVersion = record.versions + 1;
  await writeVersionBlob(id, nextVersion, envelope, record.versions);
  const updated: HostedRecord = {
    ...record,
    bytes: [...record.bytes, envelope.byteLength],
    updatedAt: new Date().toISOString(),
    versions: nextVersion,
  };
  await writeRecord(updated);
  return updated;
}

export async function readHostedRecord(
  id: string
): Promise<HostedRecord | null> {
  if (!isHostedId(id)) {
    return null;
  }
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(recordPath(id), { access: "private", useCache: false });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new HostedUnavailableError(undefined, error);
  }
  if (result?.statusCode !== 200) {
    return null;
  }
  const text = await new Response(result.stream).text();
  try {
    const parsed = parseRecord(JSON.parse(text));
    if (parsed) {
      return parsed;
    }
  } catch {
    // Fall through to the invalid-record error.
  }
  throw new HostedUnavailableError("Stored hosted record is invalid.");
}

export async function readHostedVersion(
  id: string,
  seq: number
): Promise<{
  bytes: Uint8Array;
  version: number;
  record: HostedRecord;
} | null> {
  const record = await readHostedRecord(id);
  if (!record) {
    return null;
  }
  const version = versionFromSeq(record, seq);
  if (version === null) {
    return null;
  }
  const bytes = await readVersionBlob(id, version);
  if (!bytes) {
    return null;
  }
  return { bytes, record, version };
}

export async function markInscribed(
  id: string,
  secret: Uint8Array,
  origin: string
): Promise<HostedRecord> {
  assertHostedId(id);
  assertSecretLength(secret);
  const record = await readHostedRecord(id);
  if (!record) {
    throw new HostedUnavailableError("Hosted draft not found.");
  }
  assertSecret(secret, record);
  if (record.origin !== null) {
    throw new HostedConflictError("This hosted draft is already inscribed.", {
      inscribed: true,
    });
  }
  const updated: HostedRecord = {
    ...record,
    origin,
    updatedAt: new Date().toISOString(),
  };
  await writeRecord(updated);
  return updated;
}

function versionFromSeq(record: HostedRecord, seq: number): number | null {
  if (seq === -1) {
    return record.versions;
  }
  if (seq === -2) {
    return 1;
  }
  if (Number.isInteger(seq) && seq >= 0 && seq < record.versions) {
    return seq + 1;
  }
  return null;
}

function assertHostedId(id: string): void {
  if (!isHostedId(id)) {
    throw new RangeError("Not a hosted draft id.");
  }
}

function assertSecretLength(secret: Uint8Array): void {
  if (secret.byteLength !== SECRET_BYTES) {
    throw new RangeError("Hosted secret must be 32 bytes.");
  }
}

function assertEnvelope(envelope: Uint8Array): void {
  if (envelope.byteLength > MAX_ENVELOPE_BYTES) {
    throw new RangeError("too-large");
  }
  try {
    parseEnvelope(envelope);
  } catch (error) {
    throw new RangeError("invalid-envelope", { cause: error });
  }
}

function assertSecret(secret: Uint8Array, record: HostedRecord): void {
  if (sha256Hex(secret) !== record.secretSha256) {
    throw new HostedAuthError();
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return Utils.toHex(Hash.sha256(Array.from(bytes)));
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!BASE64URL.test(value)) {
    return null;
  }
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

function parseRecord(value: unknown): HostedRecord | null {
  if (!isJsonRecord(value)) {
    return null;
  }
  if (!(typeof value.id === "string" && HOSTED_ID.test(value.id))) {
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
    !(
      typeof value.versions === "number" &&
      Number.isInteger(value.versions) &&
      value.versions >= 1
    )
  ) {
    return null;
  }
  if (!(Array.isArray(value.bytes) && value.bytes.length === value.versions)) {
    return null;
  }
  const bytes: number[] = [];
  for (const entry of value.bytes) {
    if (!(typeof entry === "number" && Number.isInteger(entry) && entry >= 0)) {
      return null;
    }
    bytes.push(entry);
  }
  if (
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  if (!(value.origin === null || typeof value.origin === "string")) {
    return null;
  }
  return {
    bytes,
    createdAt: value.createdAt,
    id: value.id,
    origin: value.origin,
    secretSha256: value.secretSha256,
    updatedAt: value.updatedAt,
    versions: value.versions,
  };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function writeRecord(record: HostedRecord): Promise<void> {
  try {
    await put(recordPath(record.id), JSON.stringify(record), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new HostedUnavailableError(undefined, error);
  }
}

async function writeVersionBlob(
  id: string,
  n: number,
  envelope: Uint8Array,
  current?: number
): Promise<void> {
  try {
    await put(versionPath(id, n), Buffer.from(envelope), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/x-bitplan",
    });
  } catch (error) {
    let exists = false;
    try {
      await head(versionPath(id, n));
      exists = true;
    } catch {
      // Preserve the write failure if the version blob cannot be confirmed.
    }
    if (exists) {
      throw new HostedConflictError("Hosted draft version already exists.", {
        cause: error,
        current,
      });
    }
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new HostedUnavailableError(undefined, error);
  }
}

async function readVersionBlob(
  id: string,
  n: number
): Promise<Uint8Array | null> {
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(versionPath(id, n), {
      access: "private",
      useCache: false,
    });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new HostedUnavailableError(undefined, error);
  }
  if (result?.statusCode !== 200) {
    return null;
  }
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}
