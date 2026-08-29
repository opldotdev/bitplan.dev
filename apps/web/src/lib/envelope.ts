/**
 * The bitplan on-chain envelope.
 *
 * Binary layout (see packages/cli/ENVELOPE.md — that file is the public spec):
 *
 *   'BPLN' (4 bytes ASCII) | version byte 0x01 | uint32-LE header length |
 *   UTF-8 JSON header | ciphertext
 *
 * The ciphertext is AES-256-GCM (WebCrypto, 128-bit tag appended) over a
 * UTF-8 JSON plaintext. The content key is 32 random bytes, never persisted:
 * it only survives as the wrapped copy in the header, encrypted by the user's
 * wallet under BRC-2 self-encryption.
 */

// TODO: extract shared @bitplan/envelope package (tracked in TODO.md)

/** ASCII 'BPLN'. */
export const MAGIC = Uint8Array.from([0x42, 0x50, 0x4c, 0x4e]);
export const ENVELOPE_VERSION = 0x01;

/** Byte length of the AES-GCM initialization vector. */
export const IV_BYTES = 12;
/** Byte length of the AES-256 content key. */
export const CONTENT_KEY_BYTES = 32;

/** Largest header we will parse; a real header is a few hundred bytes. */
const MAX_HEADER_BYTES = 64 * 1024;

export class EnvelopeError extends Error {
  override readonly name = "EnvelopeError";
}

export interface EnvelopeKeyWrap {
  /** base64 of the wallet.encrypt output over the raw content key. */
  ciphertext: string;
  keyID: string;
  /** Only mode defined in v1: wrapped by the author's own wallet. */
  mode: "brc2-self";
  protocolID: [number, string];
}

export interface EnvelopeHeader {
  alg: "aes-256-gcm";
  /** base64, 12 bytes. */
  iv: string;
  key: EnvelopeKeyWrap;
  v: 1;
}

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
  html: string;
  meta: DraftMeta;
}

export interface ParsedEnvelope {
  ciphertext: Uint8Array;
  header: EnvelopeHeader;
}

/**
 * Minimal wallet surface used to unwrap the content key.
 * Satisfied by `@bsv/sdk` WalletClient and by the in-test XOR mock.
 */
export interface EnvelopeWallet {
  decrypt: (args: {
    protocolID: [number, string];
    keyID: string;
    counterparty: "self";
    ciphertext: number[];
  }) => Promise<{ plaintext: number[] }>;
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
  out[offset] = ENVELOPE_VERSION;
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
 * Rejects anything that is not a v1 bitplan envelope.
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
  if (version !== ENVELOPE_VERSION) {
    throw new EnvelopeError(
      `Unsupported bitplan envelope version 0x${(version ?? 0).toString(16).padStart(2, "0")}; this viewer understands 0x01.`
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

  return { ciphertext, header };
}

function assertHeader(value: unknown): EnvelopeHeader {
  if (typeof value !== "object" || value === null) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: header is not an object."
    );
  }
  const h = value as Record<string, unknown>;
  if (h.v !== 1) {
    throw new EnvelopeError(
      `Unsupported bitplan header version ${String(h.v)}; this viewer understands 1.`
    );
  }
  if (h.alg !== "aes-256-gcm") {
    throw new EnvelopeError(
      `Unsupported bitplan cipher "${String(h.alg)}"; this viewer understands aes-256-gcm.`
    );
  }
  if (typeof h.iv !== "string" || fromBase64(h.iv).length !== IV_BYTES) {
    throw new EnvelopeError(
      `Malformed bitplan envelope: iv must be ${IV_BYTES} base64-encoded bytes.`
    );
  }
  const { key } = h;
  if (typeof key !== "object" || key === null) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: header has no key wrap."
    );
  }
  const k = key as Record<string, unknown>;
  if (k.mode !== "brc2-self") {
    throw new EnvelopeError(
      `Unsupported bitplan key wrap mode "${String(k.mode)}"; this viewer understands brc2-self.`
    );
  }
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
  if (typeof k.ciphertext !== "string" || k.ciphertext.length === 0) {
    throw new EnvelopeError(
      "Malformed bitplan envelope: key.ciphertext is missing."
    );
  }

  return {
    alg: "aes-256-gcm",
    iv: h.iv,
    key: {
      ciphertext: k.ciphertext,
      keyID: k.keyID,
      mode: "brc2-self",
      protocolID: [k.protocolID[0], k.protocolID[1]],
    },
    v: 1,
  };
}

/**
 * Unwrap the content key through the wallet and decrypt the body.
 *
 * The header's own protocolID / keyID are used, not this viewer's constants, so
 * an envelope written by a future version with a different protocol still
 * decrypts as long as the wallet holds the key.
 */
export async function openEnvelope(
  wallet: EnvelopeWallet,
  bytes: Uint8Array
): Promise<{ header: EnvelopeHeader; plaintext: DraftPlaintext }> {
  const { header, ciphertext } = parseEnvelope(bytes);

  const [level] = header.key.protocolID;
  if (level !== 0 && level !== 1 && level !== 2) {
    throw new EnvelopeError(
      `Malformed bitplan envelope: key.protocolID security level ${level} is not 0, 1 or 2.`
    );
  }

  let unwrapped: Awaited<ReturnType<EnvelopeWallet["decrypt"]>>;
  try {
    unwrapped = await wallet.decrypt({
      ciphertext: Array.from(fromBase64(header.key.ciphertext)),
      counterparty: "self",
      keyID: header.key.keyID,
      protocolID: [level, header.key.protocolID[1]],
    });
  } catch (error) {
    throw new EnvelopeError(
      `The wallet refused to unwrap this draft's content key (protocol ${header.key.protocolID[1]}, keyID ${header.key.keyID}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  const contentKey = Uint8Array.from(unwrapped.plaintext);
  if (contentKey.length !== CONTENT_KEY_BYTES) {
    throw new EnvelopeError(
      `Wallet returned a ${contentKey.length}-byte content key; expected ${CONTENT_KEY_BYTES}.`
    );
  }

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    new Uint8Array(contentKey),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  let body: Uint8Array;
  try {
    body = new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { iv: new Uint8Array(fromBase64(header.iv)), name: "AES-GCM" },
        cryptoKey,
        new Uint8Array(ciphertext)
      )
    );
  } catch (error) {
    throw new EnvelopeError(
      "Could not decrypt this draft: the ciphertext failed its authentication tag. The content or the key wrap has been altered.",
      { cause: error }
    );
  } finally {
    contentKey.fill(0);
  }

  let plaintext: unknown;
  try {
    plaintext = JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    throw new EnvelopeError(
      "Decrypted this draft but its plaintext is not valid JSON.",
      {
        cause: error,
      }
    );
  }
  if (
    typeof plaintext !== "object" ||
    plaintext === null ||
    typeof (plaintext as DraftPlaintext).html !== "string"
  ) {
    throw new EnvelopeError(
      "Decrypted this draft but its plaintext has no html document."
    );
  }

  return { header, plaintext: plaintext as DraftPlaintext };
}
