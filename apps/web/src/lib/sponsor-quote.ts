import { sponsorTierForSlot } from "@/lib/sponsor-receipt";
import { type SponsorQuote, sponsorPriceUsd } from "@/lib/sponsors";

const EXCHANGE_RATE_URL =
  "https://api.whatsonchain.com/v1/bsv/main/exchangerate";
const SATOSHIS_PER_BSV = 100_000_000;
const PRICE_TOLERANCE = 0.02;

export class SponsorQuoteUnavailableError extends Error {
  constructor(
    message = "The current BSV price is unavailable.",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "SponsorQuoteUnavailableError";
  }
}

export function sponsorSatsForUsd(priceUsd: number, bsvUsd: number): number {
  if (!(priceUsd > 0 && bsvUsd > 0 && Number.isFinite(bsvUsd))) {
    throw new SponsorQuoteUnavailableError();
  }
  return Math.ceil((priceUsd / bsvUsd) * SATOSHIS_PER_BSV);
}

export function sponsorPaymentMatchesQuote(
  actualSats: number,
  quotedSats: number
): boolean {
  return (
    Number.isSafeInteger(actualSats) &&
    Number.isSafeInteger(quotedSats) &&
    Math.abs(actualSats - quotedSats) <= quotedSats * PRICE_TOLERANCE
  );
}

export async function quoteSponsorSlot(
  slotId: string,
  fetcher: typeof fetch = fetch
): Promise<SponsorQuote> {
  const tier = sponsorTierForSlot(slotId);
  if (!tier) {
    throw new RangeError("Unknown sponsor slot.");
  }
  let response: Response;
  try {
    response = await fetcher(EXCHANGE_RATE_URL, {
      next: { revalidate: 60 },
    });
  } catch (error) {
    throw new SponsorQuoteUnavailableError(undefined, { cause: error });
  }
  if (!response.ok) {
    throw new SponsorQuoteUnavailableError();
  }
  const body: unknown = await response.json().catch(() => undefined);
  const bsvUsd =
    body && typeof body === "object" && "rate" in body
      ? Number(body.rate)
      : Number.NaN;
  const priceUsd = sponsorPriceUsd(slotId, tier);
  return {
    bsvUsd,
    priceSats: sponsorSatsForUsd(priceUsd, bsvUsd),
    priceUsd,
    slotId,
  };
}
