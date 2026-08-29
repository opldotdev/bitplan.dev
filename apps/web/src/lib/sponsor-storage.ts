import { BlobNotFoundError, del, get, head, list, put } from "@vercel/blob";

import {
  MAX_SPONSOR_BEEF_BYTES,
  type SponsorReceipt,
  validateSponsorReceipt,
} from "@/lib/sponsor-receipt";
import { SPONSOR_SLOT_IDS } from "@/lib/sponsors";

const RECEIPT_PREFIX = "sponsors/";

export class SponsorSlotClaimedError extends Error {
  constructor(slotId: string, cause?: unknown) {
    super(`Sponsor slot ${slotId} is already sold.`, { cause });
    this.name = "SponsorSlotClaimedError";
  }
}

export class SponsorStorageUnavailableError extends Error {
  constructor(
    message = "Sponsor receipt storage is unavailable.",
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "SponsorStorageUnavailableError";
  }
}

export function sponsorReceiptPath(slotId: string): string {
  return `${RECEIPT_PREFIX}${slotId}.beef`;
}

function ensureSlot(slotId: string): void {
  if (!SPONSOR_SLOT_IDS.includes(slotId)) {
    throw new RangeError("Unknown sponsor slot.");
  }
}

export async function isSponsorSlotClaimed(slotId: string): Promise<boolean> {
  ensureSlot(slotId);
  try {
    await head(sponsorReceiptPath(slotId));
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return false;
    }
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new SponsorStorageUnavailableError(undefined, error);
  }
}

export async function claimSponsorSlot(
  slotId: string,
  beef: Uint8Array
): Promise<string> {
  ensureSlot(slotId);
  try {
    const blob = await put(sponsorReceiptPath(slotId), Buffer.from(beef), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/octet-stream",
    });
    return blob.etag;
  } catch (error) {
    let claimed = false;
    try {
      await head(sponsorReceiptPath(slotId));
      claimed = true;
    } catch {
      // Preserve the write failure if no winning receipt can be confirmed.
    }
    if (claimed) {
      // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
      throw new SponsorSlotClaimedError(slotId, error);
    }
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new SponsorStorageUnavailableError(undefined, error);
  }
}

export interface StoredSponsorReceipt {
  beef: Uint8Array;
  etag: string;
}

export async function readStoredBeef(
  pathname: string
): Promise<StoredSponsorReceipt | null> {
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(pathname, { access: "private", useCache: false });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new SponsorStorageUnavailableError(undefined, error);
  }
  if (result?.statusCode !== 200) {
    return null;
  }
  if (result.blob.size > MAX_SPONSOR_BEEF_BYTES) {
    throw new SponsorStorageUnavailableError(
      "Stored sponsor receipt is too large."
    );
  }
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  if (bytes.length > MAX_SPONSOR_BEEF_BYTES) {
    throw new SponsorStorageUnavailableError(
      "Stored sponsor receipt is too large."
    );
  }
  return { beef: bytes, etag: result.blob.etag };
}

export function readStoredSponsorReceipt(
  slotId: string
): Promise<StoredSponsorReceipt | null> {
  ensureSlot(slotId);
  return readStoredBeef(sponsorReceiptPath(slotId));
}

export async function readSponsorBeef(
  slotId: string
): Promise<Uint8Array | null> {
  return (await readStoredSponsorReceipt(slotId))?.beef ?? null;
}

export async function releaseSponsorSlot(
  slotId: string,
  etag: string
): Promise<void> {
  ensureSlot(slotId);
  try {
    await del(sponsorReceiptPath(slotId), { ifMatch: etag });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new SponsorStorageUnavailableError(
      "Rejected sponsor receipt could not be released.",
      error
    );
  }
}

export async function readSponsorReceipt(
  slotId: string
): Promise<SponsorReceipt | null> {
  const beef = await readSponsorBeef(slotId);
  return beef ? validateSponsorReceipt(beef, slotId) : null;
}

export async function listSponsorReceipts(): Promise<
  ReadonlyMap<string, SponsorReceipt>
> {
  const paths = new Set<string>();
  try {
    const page = await list({ limit: 1000, prefix: RECEIPT_PREFIX });
    for (const blob of page.blobs) {
      paths.add(blob.pathname);
    }
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new SponsorStorageUnavailableError(undefined, error);
  }

  const receipts = new Map<string, SponsorReceipt>();
  await Promise.all(
    SPONSOR_SLOT_IDS.map(async (slotId) => {
      if (!paths.has(sponsorReceiptPath(slotId))) {
        return;
      }
      const receipt = await readSponsorReceipt(slotId);
      if (receipt) {
        receipts.set(slotId, receipt);
      }
    })
  );
  return receipts;
}
