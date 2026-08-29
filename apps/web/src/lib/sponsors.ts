export const SPONSOR_APP = "bitplan";
export const SPONSOR_CONTENT_TYPE = "image/webp";
export const SPONSOR_PAYMENT_ADDRESS = "14iPT5Yqcz3qUHxRo7vqNoxmvxr4P6J9Ah";
export const SPONSOR_SUBTYPE = "bitplanSponsorSlot";

export type SponsorTierId = "diamond" | "gold" | "platinum" | "silver";

export interface SponsorTier {
  gridClassName: string;
  id: SponsorTierId;
  imageHeight: number;
  imageWidth: number;
  name: string;
  priceSats: number;
  priceUsd: number;
  slotClassName: string;
  slotIds: readonly string[];
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
    priceSats: 3_000_000_000,
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
    priceSats: 1_500_000_000,
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
    priceSats: 600_000_000,
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
    priceSats: 300_000_000,
    priceUsd: 50,
    slotClassName: "aspect-[384/128]",
    slots: 12,
  }),
];

export const SPONSOR_SLOT_IDS = SPONSOR_TIERS.flatMap((tier) => tier.slotIds);

export function sponsorImageUrl(slotId: string): string {
  return `/api/sponsors/${encodeURIComponent(slotId)}/image`;
}

export function sponsorSubtype(slotId: string): string {
  return `${SPONSOR_SUBTYPE}:${slotId}`;
}
