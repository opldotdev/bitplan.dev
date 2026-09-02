/**
 * The bitplan on-chain envelope.
 *
 * Binary layout (see packages/cli/ENVELOPE.md):
 *
 *   'BPLN' | version | uint32-LE header length | UTF-8 JSON header | body
 *
 * Wire byte 0x02 encrypts the document once with an SDK SymmetricKey, then
 * concatenates one wallet-wrapped copy of that key per authorized identity
 * after the payload ciphertext. A plan with no invited readers has one slot,
 * the publisher's.
 */

import { Hash, SymmetricKey, Utils, type WalletInterface } from "@bsv/sdk";

import { normalizeIdentityKey } from "@/lib/sharing";

/** ASCII 'BPLN'. */
export const MAGIC = Uint8Array.from([0x42, 0x50, 0x4c, 0x4e]);
export const SHARED_ENVELOPE_VERSION = 0x02;
export const ENVELOPE_WIRE_VERSION = SHARED_ENVELOPE_VERSION;

/** Largest header we will parse; a real header is a few hundred bytes. */
const MAX_HEADER_BYTES = 64 * 1024;
const BITPLAN_PROTOCOL = [2, "bitplan"] as const;
const CONTENT_KEY_BYTES = 32;
const MAX_SHARED_RECIPIENTS = 128;
const MIN_SYMMETRIC_CIPHERTEXT_BYTES = 48;
const HEADER_SHA256_PLACEHOLDER = "0".repeat(64);

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

export type EnvelopeHeader = SharedEnvelopeHeader;

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

export type EncryptingEnvelopeWallet = Pick<
  WalletInterface,
  "encrypt" | "getPublicKey"
>;

export function sharedWith(header: EnvelopeHeader): string[] {
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

function concatenate(
  chunks: readonly Uint8Array[],
  length: number
): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Seal a draft as a bitplan envelope. Recipients are extra reader slots;
 * the publisher's self slot is always present.
 */
export async function sealEnvelope(
  wallet: EncryptingEnvelopeWallet,
  plaintext: DraftPlaintext,
  keyID: string,
  recipientIdentityKeys: readonly string[] = []
): Promise<Uint8Array> {
  let senderPublicKey: string;
  try {
    senderPublicKey = (await wallet.getPublicKey({ identityKey: true }))
      .publicKey;
  } catch (error) {
    throw new EnvelopeError(
      `The wallet could not provide its identity key: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  const sender = assertIdentityKey(senderPublicKey, "wallet identity");

  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const value of recipientIdentityKeys) {
    const identityKey = assertIdentityKey(value, "recipient identity");
    if (identityKey === sender || seen.has(identityKey)) {
      continue;
    }
    seen.add(identityKey);
    recipients.push(identityKey);
  }
  if (recipients.length > MAX_SHARED_RECIPIENTS) {
    throw new EnvelopeError(
      `A draft supports at most ${MAX_SHARED_RECIPIENTS} recipient identities; got ${recipients.length}.`
    );
  }

  const readers = [sender, ...recipients];
  const documentKey = SymmetricKey.fromRandom();
  const documentKeyBytes = documentKey.toArray("be", CONTENT_KEY_BYTES);
  const slotBodies = await Promise.all(
    readers.map(async (identityKey) => {
      const encrypted = await wallet.encrypt({
        counterparty: identityKey === sender ? "self" : identityKey,
        keyID,
        plaintext: documentKeyBytes,
        protocolID: [BITPLAN_PROTOCOL[0], BITPLAN_PROTOCOL[1]],
      });
      return Uint8Array.from(encrypted.ciphertext);
    })
  );

  const boundPlaintext: DraftPlaintext = {
    ...plaintext,
    headerSha256: HEADER_SHA256_PLACEHOLDER,
  };
  const predictedPayloadLength =
    new TextEncoder().encode(JSON.stringify(boundPlaintext)).length +
    MIN_SYMMETRIC_CIPHERTEXT_BYTES;
  let offset = predictedPayloadLength;
  const slots = readers.map((identityKey, index): SharedEnvelopeSlot => {
    const length = slotBodies[index]?.length ?? 0;
    const slot = { identityKey, length, offset };
    offset += length;
    return slot;
  });
  const header: SharedEnvelopeHeader = {
    key: {
      keyID,
      mode: "brc2-multi",
      payloadLength: predictedPayloadLength,
      protocolID: [BITPLAN_PROTOCOL[0], BITPLAN_PROTOCOL[1]],
      senderIdentityKey: sender,
      slots,
    },
    v: 2,
  };
  boundPlaintext.headerSha256 = headerSha256(header);
  const payload = Uint8Array.from(
    documentKey.encrypt(
      Array.from(new TextEncoder().encode(JSON.stringify(boundPlaintext)))
    ) as number[]
  );
  if (payload.length !== predictedPayloadLength) {
    throw new EnvelopeError("Could not bind the envelope header.");
  }
  return frameEnvelope(header, concatenate([payload, ...slotBodies], offset));
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
 * Reads the bitplan envelope (wire version 0x02).
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
  if (version !== ENVELOPE_WIRE_VERSION) {
    throw new EnvelopeError(
      `Unsupported bitplan envelope version 0x${(version ?? 0).toString(16).padStart(2, "0")}; this viewer reads envelope version 0x02.`
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
  const ciphertext = bytes.subarray(prefix + headerLength);
  if (ciphertext.length === 0) {
    throw new EnvelopeError(
      "Truncated bitplan envelope: no ciphertext present."
    );
  }

  assertSharedLayout(header, ciphertext.length);
  return { ciphertext, header };
}

function assertHeader(value: unknown): EnvelopeHeader {
  if (typeof value !== "object" || value === null) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: header is not an object."
    );
  }
  const h = value as Record<string, unknown>;
  if (h.v !== 2) {
    throw new EnvelopeError(
      `Unsupported bitplan header version ${String(h.v)}; this viewer reads envelope version 0x02.`
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
  if (k.mode !== "brc2-multi") {
    throw new EnvelopeError(`Unsupported bitplan key mode "${String(k.mode)}"`);
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
  if (plaintext.headerSha256 !== headerSha256(header)) {
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
  const counterparty =
    identityKey === header.key.senderIdentityKey
      ? "self"
      : header.key.senderIdentityKey;
  const ciphertext = body.subarray(slot.offset, slot.offset + slot.length);

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

  if (decrypted.plaintext.length !== CONTENT_KEY_BYTES) {
    throw new EnvelopeError(
      `Decrypted shared key is ${decrypted.plaintext.length} bytes; expected ${CONTENT_KEY_BYTES}.`
    );
  }
  let plaintextBytes: number[];
  try {
    plaintextBytes = new SymmetricKey(decrypted.plaintext).decrypt(
      Array.from(body.subarray(0, header.key.payloadLength))
    ) as number[];
  } catch (error) {
    throw new EnvelopeError("The shared draft payload failed authentication.", {
      cause: error,
    });
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
