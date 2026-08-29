export const SPONSOR_APP = "bitplan";
export const SPONSOR_CONTENT_TYPE = "image/webp";
export const SPONSOR_PAYMENT_ADDRESS = "14iPT5Yqcz3qUHxRo7vqNoxmvxr4P6J9Ah";
export const SPONSOR_SUBTYPE = "bitplanSponsorSlot";
export const SPONSOR_TEST_SLOT_ID = "silver-1";

export type SponsorTierId = "diamond" | "gold" | "link" | "platinum" | "silver";

export interface SponsorTier {
  gridClassName: string;
  id: SponsorTierId;
  imageHeight: number;
  imageWidth: number;
  name: string;
  priceUsd: number;
  slotClassName: string;
  slotIds: readonly string[];
}

export interface SponsorQuote {
  bsvUsd: number;
  priceSats: number;
  priceUsd: number;
  slotId: string;
}

export interface Sponsor {
  name: string;
  slotId: string;
  txid: string;
  url: string;
}

export interface SponsorSlotState {
  error?: string;
  slotId: string;
  sponsor?: Sponsor;
  status: "available" | "paused" | "sponsored";
}

function createTier({
  slots,
  ...tier
}: Omit<SponsorTier, "slotIds"> & { slots: number }): SponsorTier {
  return {
    ...tier,
    slotIds: Array.from(
      { length: slots },
      (_, index) => `${tier.id}-${index + 1}`
    ),
  };
}

export const SPONSOR_TIERS: readonly SponsorTier[] = [
  createTier({
    gridClassName: "grid-cols-1 sm:grid-cols-2",
    id: "diamond",
    imageHeight: 256,
    imageWidth: 828,
    name: "Diamond",
    priceUsd: 500,
    slotClassName: "aspect-[828/256]",
    slots: 4,
  }),
  createTier({
    gridClassName: "grid-cols-2 sm:grid-cols-3",
    id: "platinum",
    imageHeight: 192,
    imageWidth: 640,
    name: "Platinum",
    priceUsd: 250,
    slotClassName: "aspect-[640/192]",
    slots: 6,
  }),
  createTier({
    gridClassName: "grid-cols-2 sm:grid-cols-4",
    id: "gold",
    imageHeight: 192,
    imageWidth: 512,
    name: "Gold",
    priceUsd: 100,
    slotClassName: "aspect-[512/192]",
    slots: 8,
  }),
  createTier({
    gridClassName: "grid-cols-3 sm:grid-cols-6",
    id: "silver",
    imageHeight: 128,
    imageWidth: 384,
    name: "Silver",
    priceUsd: 50,
    slotClassName: "aspect-[384/128]",
    slots: 12,
  }),
];

export const SPONSOR_SLOT_IDS = SPONSOR_TIERS.flatMap((tier) => tier.slotIds);

/**
 * The unlimited text-link placement. Every purchase mints a new entry keyed
 * by its txid rather than competing for a fixed slot, so the shared slot id
 * appears in each receipt but never in SPONSOR_SLOT_IDS.
 */
export const SPONSOR_LINK_SLOT_ID = "link";
export const SPONSOR_LINK_MAX_BLURB_LENGTH = 80;

export const SPONSOR_LINK_TIER: SponsorTier = {
  gridClassName: "grid-cols-1",
  id: "link",
  imageHeight: 64,
  imageWidth: 64,
  name: "Links",
  priceUsd: 10,
  slotClassName: "aspect-square",
  slotIds: [SPONSOR_LINK_SLOT_ID],
};

export interface SponsorLink {
  blurb?: string;
  href: string;
  iconUrl: string;
  name: string;
  txid: string;
}

/**
 * Identity keys for duplicate-sponsor detection: the same organization is
 * recognized by its site host (www stripped) or by its display name.
 */
export function sponsorHostKey(href: string): string | null {
  try {
    const host = new URL(href).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

export function sponsorNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function sponsorImageUrl(slotId: string): string {
  return `/api/sponsors/${encodeURIComponent(slotId)}/image`;
}

export function sponsorPriceUsd(slotId: string, tier: SponsorTier): number {
  return slotId === SPONSOR_TEST_SLOT_ID ? 0.25 : tier.priceUsd;
}

export function sponsorSubtype(slotId: string): string {
  return `${SPONSOR_SUBTYPE}:${slotId}`;
}
