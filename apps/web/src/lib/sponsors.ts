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

/** Convert a USD sponsorship amount to satoshis at a USD-per-BSV rate. */
export function usdToSatoshis(usd: number, usdPerBsv: number): number {
  if (!(usd > 0)) {
    throw new Error("Sponsorship amount must be positive.");
  }
  if (!(usdPerBsv > 0)) {
    throw new Error("BSV price is not a positive number.");
  }
  return Math.max(1, Math.ceil((usd / usdPerBsv) * 100_000_000));
}

export async function fetchBsvUsdRate(): Promise<number> {
  const response = await fetch(
    "https://api.whatsonchain.com/v1/bsv/main/exchangerate",
    { cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(`WhatsOnChain exchangerate HTTP ${response.status}`);
  }
  const body = (await response.json()) as { rate?: unknown };
  if (typeof body.rate !== "number" || !(body.rate > 0)) {
    throw new Error("WhatsOnChain exchangerate did not return a USD rate.");
  }
  return body.rate;
}

export function sponsorAddress(): string {
  const address = process.env.NEXT_PUBLIC_BITPLAN_SPONSOR_ADDRESS;
  if (!address) {
    throw new Error("NEXT_PUBLIC_BITPLAN_SPONSOR_ADDRESS is not set");
  }
  return address;
}
