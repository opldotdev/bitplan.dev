import { Inscription, MAP, MAPCommand } from "@1sat/templates";
import { OP, P2PKH, Script, Transaction } from "@bsv/sdk";

import {
  SPONSOR_APP,
  SPONSOR_CONTENT_TYPE,
  SPONSOR_PAYMENT_ADDRESS,
  SPONSOR_SLOT_IDS,
  SPONSOR_SUBTYPE,
  SPONSOR_TIERS,
  type SponsorTier,
  type SponsorTierId,
  sponsorSubtype,
} from "@/lib/sponsors";

export const MAX_SPONSOR_BEEF_BYTES = 1024 * 1024;
const MAX_SPONSOR_WEBP_BYTES = 200 * 1024;
const MAP_KEYS = ["app", "name", "subType", "subTypeData", "type"];
const SUBTYPE_DATA_KEYS = ["href", "schema", "slot", "tier"];

export interface SponsorReceipt {
  href: string;
  imageHeight: number;
  imageOutpoint: string;
  imageWidth: number;
  name: string;
  slotId: string;
  tierId: SponsorTierId;
  txid: string;
}

export class InvalidSponsorReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSponsorReceiptError";
  }
}

function fail(message: string): never {
  throw new InvalidSponsorReceiptError(message);
}

export function sponsorTierForSlot(slotId: string): SponsorTier | undefined {
  if (!SPONSOR_SLOT_IDS.includes(slotId)) {
    return;
  }
  return SPONSOR_TIERS.find((tier) => tier.slotIds.includes(slotId));
}

function hasExactKeys(
  record: Record<string, unknown>,
  keys: string[]
): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function readHttpsUrl(value: unknown): string {
  if (typeof value !== "string") {
    fail("Sponsor URL is missing.");
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      fail("Sponsor URL must be a public HTTPS URL.");
    }
    return url.toString();
  } catch (error) {
    if (error instanceof InvalidSponsorReceiptError) {
      throw error;
    }
    return fail("Sponsor URL is invalid.");
  }
}

function littleEndian32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    bytes[offset + 1] * 256 +
    bytes[offset + 2] * 65_536 +
    bytes[offset + 3] * 16_777_216
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP" &&
    littleEndian32(bytes, 4) === bytes.length - 8
  );
}

function parseSubtypeData(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!(parsed && typeof parsed === "object" && !Array.isArray(parsed))) {
      return fail("Sponsor subTypeData must be an object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof InvalidSponsorReceiptError) {
      throw error;
    }
    return fail("Sponsor subTypeData is invalid JSON.");
  }
}

function decodeSponsorMap(
  lockingScript: Transaction["outputs"][number]["lockingScript"]
): ReturnType<typeof MAP.decode> {
  for (let index = 0; index < lockingScript.chunks.length; index += 1) {
    const chunk = lockingScript.chunks[index];
    if (chunk?.op !== OP.OP_RETURN) {
      continue;
    }
    try {
      const prefixLength = new Script(
        lockingScript.chunks.slice(0, index)
      ).toBinary().length;
      const suffix = Script.fromBinary(
        lockingScript.toBinary().slice(prefixLength)
      );
      const decoded = MAP.decode(suffix);
      if (decoded) {
        return decoded;
      }
    } catch {
      // Keep looking if another protocol uses OP_RETURN first.
    }
  }
  return null;
}

export function validateSponsorReceipt(
  beef: Uint8Array,
  slotId: string
): SponsorReceipt {
  if (beef.length === 0 || beef.length > MAX_SPONSOR_BEEF_BYTES) {
    return fail("Atomic BEEF size is invalid.");
  }
  const tier = sponsorTierForSlot(slotId);
  if (!tier) {
    return fail("Unknown sponsor slot.");
  }

  let transaction: Transaction;
  try {
    transaction = Transaction.fromAtomicBEEF(beef);
  } catch {
    return fail("Body is not valid Atomic BEEF.");
  }

  const paymentScript = new P2PKH().lock(SPONSOR_PAYMENT_ADDRESS).toHex();
  const paymentOutputs = transaction.outputs.filter(
    (candidate) => candidate.lockingScript.toHex() === paymentScript
  );
  if (
    paymentOutputs.length !== 1 ||
    paymentOutputs[0]?.satoshis !== tier.priceSats
  ) {
    return fail("Transaction does not contain the exact sponsor payment.");
  }

  const sponsorOutputs = transaction.outputs.flatMap((candidate, vout) => {
    const map = decodeSponsorMap(candidate.lockingScript);
    return map?.data.app === SPONSOR_APP &&
      (map.data.subType === SPONSOR_SUBTYPE ||
        map.data.subType?.startsWith(`${SPONSOR_SUBTYPE}:`))
      ? [{ map, output: candidate, vout }]
      : [];
  });
  if (sponsorOutputs.length !== 1) {
    return fail("Transaction must contain exactly one BitPlan sponsor output.");
  }

  const [{ map, output, vout: imageVout }] = sponsorOutputs;
  if (
    output.satoshis !== 1 ||
    map.cmd !== MAPCommand.SET ||
    !hasExactKeys(map.data, MAP_KEYS) ||
    map.data.type !== "ord" ||
    map.data.subType !== sponsorSubtype(slotId)
  ) {
    return fail("Sponsor MAP metadata does not match this slot.");
  }

  const { name } = map.data;
  if (!name || name !== name.trim() || name.length > 64) {
    return fail("Sponsor name must be between 1 and 64 characters.");
  }
  const subTypeData = parseSubtypeData(map.data.subTypeData);
  if (
    !hasExactKeys(subTypeData, SUBTYPE_DATA_KEYS) ||
    subTypeData.schema !== 1 ||
    subTypeData.slot !== slotId ||
    subTypeData.tier !== tier.id
  ) {
    return fail("Sponsor subTypeData does not match this slot.");
  }
  const href = readHttpsUrl(subTypeData.href);

  let inscription: ReturnType<typeof Inscription.decode>;
  try {
    inscription = Inscription.decode(output.lockingScript);
  } catch {
    inscription = null;
  }
  if (
    !inscription?.verify() ||
    inscription.file.type !== SPONSOR_CONTENT_TYPE ||
    inscription.file.size !== inscription.file.content.length ||
    inscription.file.size === 0 ||
    inscription.file.size > MAX_SPONSOR_WEBP_BYTES
  ) {
    return fail("Sponsor output must contain one WebP of at most 200 KiB.");
  }
  if (!isWebp(inscription.file.content)) {
    return fail("Sponsor image is not a valid WebP container.");
  }

  const txid = transaction.id("hex");
  return {
    href,
    imageHeight: tier.imageHeight,
    imageOutpoint: `${txid}_${imageVout}`,
    imageWidth: tier.imageWidth,
    name,
    slotId,
    tierId: tier.id,
    txid,
  };
}

export function extractSponsorImage(
  beef: Uint8Array,
  slotId: string
): Uint8Array {
  const receipt = validateSponsorReceipt(beef, slotId);
  const transaction = Transaction.fromAtomicBEEF(beef);
  const outputIndex = Number(receipt.imageOutpoint.split("_")[1]);
  const output = transaction.outputs[outputIndex];
  const inscription = output ? Inscription.decode(output.lockingScript) : null;
  if (!inscription) {
    return fail("Sponsor image is missing.");
  }
  return inscription.file.content;
}
