/** Hosted room transport encryption. Existing BPLN inscription framing is unchanged. */
const encoder = new TextEncoder();
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const FRAGMENT_PREFIX = /^#/;
const ROOM_ID = /^[a-zA-Z0-9]{20,64}$/;

function base64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
function bytes(encoded: string): Uint8Array<ArrayBuffer> {
  const padded = encoded.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
export function newCapability(): string {
  return base64(crypto.getRandomValues(new Uint8Array(32)));
}
export function parseCapability(value: unknown): string {
  if (
    typeof value !== "string" ||
    !SECRET.test(value) ||
    base64(bytes(value)) !== value
  ) {
    throw new Error("Invalid collaboration capability.");
  }
  return value;
}

async function derive(secret: string, label: string): Promise<ArrayBuffer> {
  const material = await crypto.subtle.importKey(
    "raw",
    bytes(parseCapability(secret)),
    "HKDF",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      info: encoder.encode(label),
      name: "HKDF",
      salt: encoder.encode("bitplan-room/1"),
    },
    material,
    256
  );
}

/** Only this domain-separated proof, never the invitation secret, goes to Convex. */
export async function roomProof(secret: string): Promise<string> {
  return base64(new Uint8Array(await derive(secret, "room-authorization")));
}

async function roomKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    await derive(secret, "content-encryption"),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptRoomValue(
  secret: string,
  binding: string,
  value: unknown
): Promise<string> {
  const plaintext = encoder.encode(JSON.stringify(value));
  if (plaintext.byteLength > 250_000) {
    throw new Error("This collaboration item is too large (250 KB maximum).");
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { additionalData: encoder.encode(binding), iv, name: "AES-GCM" },
      await roomKey(secret),
      plaintext
    )
  );
  // Chunking avoids spread argument limits for embedded images and HTML.
  let binary = "";
  for (const byte of encrypted) {
    binary += String.fromCharCode(byte);
  }
  return `${base64(iv)}.${btoa(binary)}`;
}

export async function decryptRoomValue(
  secret: string,
  binding: string,
  ciphertext: string
): Promise<unknown> {
  if (ciphertext.length > 340_000) {
    throw new Error("Collaboration item exceeds the size limit.");
  }
  const parts = ciphertext.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid encrypted collaboration item.");
  }
  const iv = bytes(parts[0]);
  if (iv.length !== 12) {
    throw new Error("Invalid collaboration nonce.");
  }
  const decrypted = await crypto.subtle.decrypt(
    { additionalData: encoder.encode(binding), iv, name: "AES-GCM" },
    await roomKey(secret),
    bytes(parts[1])
  );
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(decrypted)
  );
}

export function collaborationFragment(
  hash: string
): { roomId: string; secret: string } | null {
  const params = new URLSearchParams(hash.replace(FRAGMENT_PREFIX, ""));
  const roomId = params.get("room");
  const secret = params.get("collab");
  if (!(roomId || secret)) {
    return null;
  }
  if (
    !(roomId && ROOM_ID.test(roomId)) ||
    params.getAll("room").length !== 1 ||
    params.getAll("collab").length !== 1
  ) {
    throw new Error("Invalid collaboration invitation.");
  }
  return { roomId, secret: parseCapability(secret) };
}
