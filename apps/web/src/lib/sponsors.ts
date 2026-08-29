export type SponsorTierId = "diamond" | "gold" | "platinum" | "silver";

export interface SponsorTier {
  gridClassName: string;
  id: SponsorTierId;
  name: string;
  priceUsd: number;
  slotClassName: string;
  slotIds: readonly string[];
}

function createTier({
  gridClassName,
  id,
  priceUsd,
  name,
  slotClassName,
  slots,
}: Omit<SponsorTier, "slotIds"> & { slots: number }): SponsorTier {
  return {
    gridClassName,
    id,
    name,
    priceUsd,
    slotClassName,
    slotIds: Array.from({ length: slots }, (_, index) => `${id}-${index + 1}`),
  };
}

export const SPONSOR_TIERS: readonly SponsorTier[] = [
  createTier({
    gridClassName: "grid-cols-1 sm:grid-cols-2",
    id: "diamond",
    name: "Diamond",
    priceUsd: 500,
    slotClassName: "min-h-32",
    slots: 4,
  }),
  createTier({
    gridClassName: "grid-cols-2 sm:grid-cols-3",
    id: "platinum",
    name: "Platinum",
    priceUsd: 250,
    slotClassName: "min-h-24",
    slots: 6,
  }),
  createTier({
    gridClassName: "grid-cols-2 sm:grid-cols-4",
    id: "gold",
    name: "Gold",
    priceUsd: 100,
    slotClassName: "min-h-20",
    slots: 8,
  }),
  createTier({
    gridClassName: "grid-cols-3 sm:grid-cols-6",
    id: "silver",
    name: "Silver",
    priceUsd: 50,
    slotClassName: "min-h-12",
    slots: 12,
  }),
];
