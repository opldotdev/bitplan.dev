/**
 * The bitplan on-chain envelope.
 *
 * Binary layout (see packages/cli/ENVELOPE.md):
 *
 *   'BPLN' | version | uint32-LE header length | UTF-8 JSON header | body
 *
 * v1 contains one self-encrypted ciphertext. v2 contains one complete BRC-2
 * wrapped-key slot per authorized identity and one SDK-encrypted payload.
 */

import { Hash, SymmetricKey, Utils, type WalletInterface } from "@bsv/sdk";

import { normalizeIdentityKey } from "@/lib/sharing";

/** ASCII 'BPLN'. */
export const MAGIC = Uint8Array.from([0x42, 0x50, 0x4c, 0x4e]);
export const ENVELOPE_VERSION = 0x01;
export const SHARED_ENVELOPE_VERSION = 0x02;

/** Largest header we will parse; a real header is a few hundred bytes. */
const MAX_HEADER_BYTES = 64 * 1024;
const BITPLAN_PROTOCOL = [2, "bitplan"] as const;
const CONTENT_KEY_BYTES = 32;
const MAX_SHARED_RECIPIENTS = 128;
const MIN_SYMMETRIC_CIPHERTEXT_BYTES = 48;

export class EnvelopeError extends Error {
  override readonly name = "EnvelopeError";
}

export type EnvelopeAccessIssue =
  | "decrypt-refused"
  | "identity-unavailable"
  | "not-authorized";

export class EnvelopeAccessError extends EnvelopeError {
  readonly issue: EnvelopeAccessIssue;

  constructor(issue: EnvelopeAccessIssue, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.issue = issue;
  }
}

export interface PrivateEnvelopeKey {
  keyID: string;
  /** BRC-2 self-encryption through the author's wallet. */
  mode: "brc2-self";
  protocolID: [number, string];
}

export interface PrivateEnvelopeHeader {
  key: PrivateEnvelopeKey;
  v: 1;
}

export interface SharedEnvelopeSlot {
  identityKey: string;
  length: number;
  offset: number;
}

export interface SharedEnvelopeKey {
  keyID: string;
  mode: "brc2-multi";
  payloadLength: number;
  protocolID: [number, string];
  senderIdentityKey: string;
  slots: SharedEnvelopeSlot[];
}

export interface SharedEnvelopeHeader {
  key: SharedEnvelopeKey;
  v: 2;
}

export type EnvelopeHeader = PrivateEnvelopeHeader | SharedEnvelopeHeader;

export interface DraftMeta {
  cliVersion: string;
  createdAt: string;
  description: string | null;
  fileSha256: string;
  gitBranch: string | null;
  gitCommitSha: string | null;
  gitCommitSubject: string | null;
  gitDirty: boolean | null;
  repoHost: string | null;
  repoName: string | null;
  repoOrg: string | null;
  title: string | null;
}

/** The JSON that lives inside the ciphertext. */
export interface DraftPlaintext {
  headerSha256?: string;
  html: string;
  meta: DraftMeta;
}

export interface ParsedEnvelope {
  ciphertext: Uint8Array;
  header: EnvelopeHeader;
}

/**
 * Minimal wallet surface used to decrypt the body.
 * Satisfied by `@bsv/sdk` WalletClient and by the in-test XOR mock.
 */
export type EnvelopeWallet = Pick<WalletInterface, "decrypt" | "getPublicKey">;

type EncryptingEnvelopeWallet = Pick<WalletInterface, "encrypt">;

export function sharedWith(header: EnvelopeHeader): string[] {
  if (header.v === 1) {
    return [];
  }
  const sender = header.key.senderIdentityKey;
  return header.key.slots
    .map((slot) => slot.identityKey)
    .filter((identityKey) => identityKey !== sender);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/** Seal a wallet-only draft with the same BRC-2 envelope used by the CLI. */
export async function sealPrivateEnvelope(
  wallet: EncryptingEnvelopeWallet,
  plaintext: DraftPlaintext,
  keyID: string
): Promise<Uint8Array> {
  const body = new TextEncoder().encode(JSON.stringify(plaintext));
  const encrypted = await wallet.encrypt({
    counterparty: "self",
    keyID,
    plaintext: Array.from(body),
    protocolID: [2, "bitplan"],
  });
  return frameEnvelope(
    {
      key: {
        keyID,
        mode: "brc2-self",
        protocolID: [2, "bitplan"],
      },
      v: 1,
    },
    Uint8Array.from(encrypted.ciphertext)
  );
}

function headerSha256(header: EnvelopeHeader): string {
  const bytes = new TextEncoder().encode(canonicalJson(header));
  return Utils.toHex(Hash.sha256(Array.from(bytes)));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => compareKeys(a, b))
        )
      : item
  );
}

function compareKeys(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/** Assemble magic + version + header length + header + ciphertext. */
export function frameEnvelope(
  header: EnvelopeHeader,
  ciphertext: Uint8Array
): Uint8Array {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(
    MAGIC.length + 1 + 4 + headerBytes.length + ciphertext.length
  );
  let offset = 0;
  out.set(MAGIC, offset);
  offset += MAGIC.length;
  out[offset] = header.v;
  offset += 1;
  new DataView(out.buffer, out.byteOffset + offset, 4).setUint32(
    0,
    headerBytes.length,
    true
  );
  offset += 4;
  out.set(headerBytes, offset);
  offset += headerBytes.length;
  out.set(ciphertext, offset);
  return out;
}

/**
 * Split a serialized envelope into its header and ciphertext.
 *
 * Reads private v1 and shared v2 bitplan envelopes.
 */
export function parseEnvelope(bytes: Uint8Array): ParsedEnvelope {
  const prefix = MAGIC.length + 1 + 4;
  if (bytes.length < prefix) {
    throw new EnvelopeError(
      `Not a bitplan envelope: ${bytes.length} bytes is too short to hold a header.`
    );
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (bytes[i] !== MAGIC[i]) {
      throw new EnvelopeError(
        "Not a bitplan envelope: missing 'BPLN' magic at the start of the content."
      );
    }
  }
  const version = bytes[MAGIC.length];
  if (version !== ENVELOPE_VERSION && version !== SHARED_ENVELOPE_VERSION) {
    throw new EnvelopeError(
      `Unsupported bitplan envelope version 0x${(version ?? 0).toString(16).padStart(2, "0")}; this viewer understands 0x01 and 0x02.`
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(MAGIC.length + 1, true);
  if (headerLength === 0) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: header length is zero."
    );
  }
  if (headerLength > MAX_HEADER_BYTES) {
    throw new EnvelopeError(
      `Malformed bitplan envelope: header claims ${headerLength} bytes (max ${MAX_HEADER_BYTES}).`
    );
  }
  if (bytes.length < prefix + headerLength) {
    throw new EnvelopeError(
      `Truncated bitplan envelope: header claims ${headerLength} bytes but only ${bytes.length - prefix} remain.`
    );
  }

  const headerJson = new TextDecoder().decode(
    bytes.subarray(prefix, prefix + headerLength)
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(headerJson);
  } catch (error) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: header is not valid JSON.",
      {
        cause: error,
      }
    );
  }

  const header = assertHeader(parsed);
  if (header.v !== version) {
    throw new EnvelopeError(
      `Malformed bitplan envelope: binary version 0x${version.toString(16).padStart(2, "0")} does not match header version ${header.v}.`
    );
  }
  const ciphertext = bytes.subarray(prefix + headerLength);
  if (ciphertext.length === 0) {
    throw new EnvelopeError(
      "Truncated bitplan envelope: no ciphertext present."
    );
  }

  if (header.v === 2) {
    assertSharedLayout(header, ciphertext.length);
  }
  return { ciphertext, header };
}

function assertHeader(value: unknown): EnvelopeHeader {
  if (typeof value !== "object" || value === null) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: header is not an object."
    );
  }
  const h = value as Record<string, unknown>;
  if (h.v !== 1 && h.v !== 2) {
    throw new EnvelopeError(
      `Unsupported bitplan header version ${String(h.v)}; this viewer understands 1 and 2.`
    );
  }
  const { key } = h;
  if (typeof key !== "object" || key === null) {
    throw new EnvelopeError("Malformed bitplan envelope: header has no key.");
  }
  const k = key as Record<string, unknown>;
  if (
    !Array.isArray(k.protocolID) ||
    k.protocolID.length !== 2 ||
    typeof k.protocolID[0] !== "number" ||
    typeof k.protocolID[1] !== "string"
  ) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: key.protocolID must be [securityLevel, name]."
    );
  }
  if (typeof k.keyID !== "string" || k.keyID.length === 0) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: key.keyID is missing."
    );
  }

  const protocolID: [number, string] = [k.protocolID[0], k.protocolID[1]];
  if (
    protocolID[0] !== BITPLAN_PROTOCOL[0] ||
    protocolID[1] !== BITPLAN_PROTOCOL[1]
  ) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: key.protocolID must be [2, bitplan]."
    );
  }
  if (h.v === 1) {
    if (k.mode !== "brc2-self") {
      throw new EnvelopeError(
        `Unsupported bitplan key mode "${String(k.mode)}" for header v1.`
      );
    }
    return {
      key: { keyID: k.keyID, mode: "brc2-self", protocolID },
      v: 1,
    };
  }

  if (k.mode !== "brc2-multi") {
    throw new EnvelopeError(
      `Unsupported bitplan key mode "${String(k.mode)}" for header v2.`
    );
  }
  if (!Number.isSafeInteger(k.payloadLength)) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: key.payloadLength is invalid."
    );
  }
  const senderIdentityKey = assertIdentityKey(
    k.senderIdentityKey,
    "key.senderIdentityKey"
  );
  if (!Array.isArray(k.slots) || k.slots.length === 0) {
    throw new EnvelopeError("Malformed bitplan envelope: key.slots is empty.");
  }
  assertSharedSlotCount(k.slots);
  const seen = new Set<string>();
  const slots = k.slots.map((slotValue, index): SharedEnvelopeSlot => {
    if (typeof slotValue !== "object" || slotValue === null) {
      throw new EnvelopeError(
        `Malformed bitplan envelope: key.slots[${index}] is not an object.`
      );
    }
    const slot = slotValue as Record<string, unknown>;
    const identityKey = assertIdentityKey(
      slot.identityKey,
      `key.slots[${index}].identityKey`
    );
    if (seen.has(identityKey)) {
      throw new EnvelopeError(
        `Malformed bitplan envelope: duplicate reader identity ${identityKey}.`
      );
    }
    seen.add(identityKey);
    if (!Number.isSafeInteger(slot.offset) || Number(slot.offset) < 0) {
      throw new EnvelopeError(
        `Malformed bitplan envelope: key.slots[${index}].offset is invalid.`
      );
    }
    if (!Number.isSafeInteger(slot.length) || Number(slot.length) <= 0) {
      throw new EnvelopeError(
        `Malformed bitplan envelope: key.slots[${index}].length is invalid.`
      );
    }
    return {
      identityKey,
      length: Number(slot.length),
      offset: Number(slot.offset),
    };
  });
  if (slots[0]?.identityKey !== senderIdentityKey) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: the first shared slot must belong to the sender."
    );
  }
  return {
    key: {
      keyID: k.keyID,
      mode: "brc2-multi",
      payloadLength: Number(k.payloadLength),
      protocolID,
      senderIdentityKey,
      slots,
    },
    v: 2,
  };
}

function assertSharedSlotCount(slots: unknown[]): void {
  if (slots.length > MAX_SHARED_RECIPIENTS + 1) {
    throw new EnvelopeError(
      `Malformed bitplan envelope: key.slots exceeds ${MAX_SHARED_RECIPIENTS + 1} readers.`
    );
  }
}

function assertIdentityKey(value: unknown, field: string): string {
  const normalized =
    typeof value === "string" ? normalizeIdentityKey(value) : null;
  if (!normalized) {
    throw new EnvelopeError(
      `Malformed bitplan envelope: ${field} is not a canonical secp256k1 point.`
    );
  }
  return normalized;
}

function assertSharedLayout(
  header: SharedEnvelopeHeader,
  bodyLength: number
): void {
  if (
    header.key.payloadLength < MIN_SYMMETRIC_CIPHERTEXT_BYTES ||
    header.key.payloadLength >= bodyLength
  ) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: shared payload length is invalid."
    );
  }
  let expectedOffset = header.key.payloadLength;
  for (const slot of header.key.slots) {
    if (slot.offset !== expectedOffset) {
      throw new EnvelopeError(
        "Malformed bitplan envelope: shared ciphertext slots are not contiguous."
      );
    }
    expectedOffset += slot.length;
  }
  if (expectedOffset !== bodyLength) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: shared ciphertext slots do not cover the body."
    );
  }
}

function assertProtocolLevel(level: number): 0 | 1 | 2 {
  if (level !== 0 && level !== 1 && level !== 2) {
    throw new EnvelopeError(
      `Malformed bitplan envelope: key.protocolID security level ${level} is not 0, 1 or 2.`
    );
  }
  return level;
}

function assertPlaintext(value: unknown): DraftPlaintext {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as DraftPlaintext).html !== "string"
  ) {
    throw new EnvelopeError(
      "Decrypted this draft but its plaintext has no html document."
    );
  }
  return value as DraftPlaintext;
}

function assertHeaderBinding(
  header: EnvelopeHeader,
  plaintext: DraftPlaintext
): void {
  if (header.v === 2 && plaintext.headerSha256 !== headerSha256(header)) {
    throw new EnvelopeError(
      "The shared draft header does not match its authenticated payload."
    );
  }
}

/**
 * Decrypt the body through the wallet.
 *
 * The keyID comes from the envelope. The protocol is validated as BitPlan's
 * exact BRC-43 protocol before any wallet call.
 */
export async function openEnvelope(
  wallet: EnvelopeWallet,
  bytes: Uint8Array
): Promise<{ header: EnvelopeHeader; plaintext: DraftPlaintext }> {
  const { ciphertext: body, header } = parseEnvelope(bytes);
  const level = assertProtocolLevel(header.key.protocolID[0]);
  let counterparty = "self";
  let ciphertext = body;
  if (header.v === 2) {
    let identityKey: string;
    try {
      const result = await wallet.getPublicKey({ identityKey: true });
      identityKey = assertIdentityKey(result.publicKey, "wallet identity");
    } catch (error) {
      // biome-ignore lint/style/useErrorCause: EnvelopeAccessError stores this argument as Error.cause.
      throw new EnvelopeAccessError(
        "identity-unavailable",
        `The wallet could not provide its identity key to open this shared draft: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
    const slot = header.key.slots.find(
      (candidate) => candidate.identityKey === identityKey
    );
    if (!slot) {
      throw new EnvelopeAccessError(
        "not-authorized",
        "This wallet identity is not authorized to decrypt this version of the draft."
      );
    }
    counterparty =
      identityKey === header.key.senderIdentityKey
        ? "self"
        : header.key.senderIdentityKey;
    ciphertext = body.subarray(slot.offset, slot.offset + slot.length);
  }

  let decrypted: Awaited<ReturnType<EnvelopeWallet["decrypt"]>>;
  try {
    decrypted = await wallet.decrypt({
      ciphertext: Array.from(ciphertext),
      counterparty,
      keyID: header.key.keyID,
      protocolID: [level, header.key.protocolID[1]],
    });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: EnvelopeAccessError stores this argument as Error.cause.
    throw new EnvelopeAccessError(
      "decrypt-refused",
      `The wallet refused to decrypt this draft (protocol ${header.key.protocolID[1]}, keyID ${header.key.keyID}): ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }

  let plaintextBytes: number[];
  if (header.v === 1) {
    plaintextBytes = decrypted.plaintext;
  } else {
    if (decrypted.plaintext.length !== CONTENT_KEY_BYTES) {
      throw new EnvelopeError(
        `Decrypted shared key is ${decrypted.plaintext.length} bytes; expected ${CONTENT_KEY_BYTES}.`
      );
    }
    try {
      plaintextBytes = new SymmetricKey(decrypted.plaintext).decrypt(
        Array.from(body.subarray(0, header.key.payloadLength))
      ) as number[];
    } catch (error) {
      throw new EnvelopeError(
        "The shared draft payload failed authentication.",
        {
          cause: error,
        }
      );
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(plaintextBytes))
    );
  } catch (error) {
    throw new EnvelopeError(
      "Decrypted this draft but its plaintext is not valid JSON.",
      {
        cause: error,
      }
    );
  }

  const plaintext = assertPlaintext(parsed);
  assertHeaderBinding(header, plaintext);
  const { headerSha256: _headerSha256, ...document } = plaintext;
  return { header, plaintext: document };
}
