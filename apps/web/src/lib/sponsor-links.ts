import { del, head, list, put } from "@vercel/blob";

import type { SponsorReceipt } from "@/lib/sponsor-receipt";
import {
  readStoredBeef,
  SponsorSlotClaimedError,
  SponsorStorageUnavailableError,
  type StoredSponsorReceipt,
} from "@/lib/sponsor-storage";
import {
  SPONSOR_LINK_MAX_BLURB_LENGTH,
  SPONSOR_LINK_SLOT_ID,
  type SponsorLink,
} from "@/lib/sponsors";

const LINK_PREFIX = "sponsors/links/";
const TXID_PATTERN = /^[0-9a-f]{64}$/;
const MAX_LINKS = 5000;
const HOUR_MS = 3_600_000;

function ensureTxid(txid: string): void {
  if (!TXID_PATTERN.test(txid)) {
    throw new RangeError("Invalid sponsor link transaction id.");
  }
}

export function sponsorLinkBeefPath(txid: string): string {
  return `${LINK_PREFIX}${txid}.beef`;
}

export function sponsorLinkSummaryPath(txid: string): string {
  return `${LINK_PREFIX}${txid}.json`;
}

export function sponsorLinkIconPath(txid: string): string {
  return `${LINK_PREFIX}${txid}.webp`;
}

export async function claimSponsorLink(
  txid: string,
  beef: Uint8Array
): Promise<string> {
  ensureTxid(txid);
  try {
    const blob = await put(sponsorLinkBeefPath(txid), Buffer.from(beef), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/octet-stream",
    });
    return blob.etag;
  } catch (error) {
    let claimed = false;
    try {
      await head(sponsorLinkBeefPath(txid));
      claimed = true;
    } catch {
      // Preserve the write failure if no stored receipt can be confirmed.
    }
    if (claimed) {
      // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
      throw new SponsorSlotClaimedError(SPONSOR_LINK_SLOT_ID, error);
    }
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new SponsorStorageUnavailableError(undefined, error);
  }
}

export function readStoredSponsorLink(
  txid: string
): Promise<StoredSponsorReceipt | null> {
  ensureTxid(txid);
  return readStoredBeef(sponsorLinkBeefPath(txid));
}

export async function releaseSponsorLink(
  txid: string,
  etag: string
): Promise<void> {
  ensureTxid(txid);
  try {
    await del(sponsorLinkBeefPath(txid), { ifMatch: etag });
    await del([sponsorLinkSummaryPath(txid), sponsorLinkIconPath(txid)]);
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new SponsorStorageUnavailableError(
      "Rejected sponsor link could not be released.",
      error
    );
  }
}

/**
 * Publish the public artifacts a link renders from: the icon WebP and a
 * summary JSON. Both are derived from the validated receipt, so overwriting
 * on a retry is idempotent.
 */
export async function publishSponsorLinkArtifacts(
  receipt: SponsorReceipt,
  icon: Uint8Array
): Promise<void> {
  try {
    const iconBlob = await put(
      sponsorLinkIconPath(receipt.txid),
      Buffer.from(icon),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 31_536_000,
        contentType: "image/webp",
      }
    );
    const summary: SponsorLink = {
      ...(receipt.blurb === undefined ? {} : { blurb: receipt.blurb }),
      href: receipt.href,
      iconUrl: iconBlob.url,
      name: receipt.name,
      txid: receipt.txid,
    };
    await put(sponsorLinkSummaryPath(receipt.txid), JSON.stringify(summary), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 300,
      contentType: "application/json",
    });
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new SponsorStorageUnavailableError(
      "Sponsor link could not be published.",
      error
    );
  }
}

export interface SponsorLinkRef {
  txid: string;
  uploadedAt: number;
  url: string;
}

/** Every published link, oldest purchase first (first come, first served). */
export async function listSponsorLinkRefs(): Promise<SponsorLinkRef[]> {
  const refs: SponsorLinkRef[] = [];
  let cursor: string | undefined;
  try {
    do {
      // biome-ignore lint/performance/noAwaitInLoops: blob pagination is cursor-sequential.
      const page = await list({ cursor, limit: 1000, prefix: LINK_PREFIX });
      for (const blob of page.blobs) {
        const txid = blob.pathname.slice(LINK_PREFIX.length, -".json".length);
        if (blob.pathname.endsWith(".json") && TXID_PATTERN.test(txid)) {
          refs.push({
            txid,
            uploadedAt: new Date(blob.uploadedAt).getTime(),
            url: blob.url,
          });
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor && refs.length < MAX_LINKS);
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the custom error forwards this cause.
    throw new SponsorStorageUnavailableError(undefined, error);
  }
  refs.sort(
    (a, b) => a.uploadedAt - b.uploadedAt || a.txid.localeCompare(b.txid)
  );
  return refs;
}

/**
 * Rotate a stable list so every entry takes a turn at the top, advancing
 * once per hour. Deterministic for a given hour, so pagination within an
 * hour stays consistent.
 */
export function rotateSponsorLinks<T>(items: readonly T[], nowMs: number): T[] {
  if (items.length === 0) {
    return [];
  }
  const offset = Math.floor(nowMs / HOUR_MS) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function isSponsorLink(value: unknown): value is SponsorLink {
  if (!(value && typeof value === "object")) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.href === "string" &&
    typeof record.iconUrl === "string" &&
    typeof record.name === "string" &&
    typeof record.txid === "string" &&
    (record.blurb === undefined ||
      (typeof record.blurb === "string" &&
        record.blurb.length <= SPONSOR_LINK_MAX_BLURB_LENGTH))
  );
}

export async function readSponsorLinkSummaries(
  refs: readonly SponsorLinkRef[]
): Promise<SponsorLink[]> {
  const results = await Promise.all(
    refs.map(async (ref) => {
      try {
        const response = await fetch(ref.url, { cache: "no-store" });
        if (!response.ok) {
          return null;
        }
        const parsed: unknown = await response.json();
        return isSponsorLink(parsed) && parsed.txid === ref.txid
          ? parsed
          : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter((link): link is SponsorLink => link !== null);
}
