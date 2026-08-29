export type SponsorTierId = "diamond" | "gold" | "platinum" | "silver";

export interface SponsorTier {
  gridClassName: string;
  id: SponsorTierId;
  monthlyPriceUsd: number;
  name: string;
  slotClassName: string;
  slotIds: readonly string[];
}

function createTier({
  gridClassName,
  id,
  monthlyPriceUsd,
  name,
  slotClassName,
  slots,
}: Omit<SponsorTier, "slotIds"> & { slots: number }): SponsorTier {
  return {
    gridClassName,
    id,
    monthlyPriceUsd,
    name,
    slotClassName,
    slotIds: Array.from({ length: slots }, (_, index) => `${id}-${index + 1}`),
  };
}

export const SPONSOR_TIERS: readonly SponsorTier[] = [
  createTier({
    gridClassName: "grid-cols-1 sm:grid-cols-2",
    id: "diamond",
    monthlyPriceUsd: 500,
    name: "Diamond",
    slotClassName: "min-h-32",
    slots: 4,
  }),
  createTier({
    gridClassName: "grid-cols-2 sm:grid-cols-3",
    id: "platinum",
    monthlyPriceUsd: 250,
    name: "Platinum",
    slotClassName: "min-h-24",
    slots: 6,
  }),
  createTier({
    gridClassName: "grid-cols-2 sm:grid-cols-4",
    id: "gold",
    monthlyPriceUsd: 100,
    name: "Gold",
    slotClassName: "min-h-20",
    slots: 8,
  }),
  createTier({
    gridClassName: "grid-cols-3 sm:grid-cols-6",
    id: "silver",
    monthlyPriceUsd: 50,
    name: "Silver",
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
