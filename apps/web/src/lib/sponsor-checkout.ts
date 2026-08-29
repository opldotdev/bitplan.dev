import { createContext, defaultPayAddress } from "@1sat/actions";
import { buildInscriptionScript } from "@1sat/templates";
import { P2PKH, type WalletInterface } from "@bsv/sdk";

import {
  SPONSOR_APP,
  SPONSOR_CONTENT_TYPE,
  SPONSOR_PAYMENT_ADDRESS,
  type SponsorQuote,
  type SponsorTier,
  sponsorSubtype,
} from "@/lib/sponsors";

const WALLET_REJECTION_PATTERN = /permission denied|user.?rejected|declined/i;

export interface SponsorCheckout {
  beef: Uint8Array<ArrayBuffer>;
  txid: string;
}

export function sponsorWalletErrorMessage(error: unknown): string {
  let message = "";
  if (error instanceof Error) {
    ({ message } = error);
  } else if (typeof error === "string") {
    message = error;
  }
  return WALLET_REJECTION_PATTERN.test(message)
    ? "The wallet declined the transaction. Nothing was published or paid."
    : "The wallet could not create the transaction. Nothing was published or paid.";
}

export async function createSponsorCheckout({
  blurb,
  image,
  name,
  quote,
  slotId,
  tier,
  url,
  wallet,
}: {
  blurb?: string;
  image: Uint8Array;
  name: string;
  quote: SponsorQuote;
  slotId: string;
  tier: SponsorTier;
  url: string;
  wallet: WalletInterface;
}): Promise<SponsorCheckout> {
  if (quote.slotId !== slotId) {
    throw new Error("Sponsor quote does not match this slot.");
  }
  const ownerAddress = await defaultPayAddress(
    createContext(wallet, { chain: "main" })
  );
  const imageScript = buildInscriptionScript(
    new P2PKH().lock(ownerAddress),
    image,
    SPONSOR_CONTENT_TYPE,
    {
      app: SPONSOR_APP,
      name,
      subType: sponsorSubtype(slotId),
      subTypeData: JSON.stringify({
        ...(blurb ? { blurb } : {}),
        href: url,
        priceSats: quote.priceSats,
        priceUsd: quote.priceUsd,
        schema: 2,
        slot: slotId,
        tier: tier.id,
      }),
      type: "ord",
    }
  );
  const result = await wallet.createAction({
    description: `Sponsor BitPlan in ${slotId}`,
    options: {
      acceptDelayedBroadcast: false,
      noSend: true,
      randomizeOutputs: false,
    },
    outputs: [
      {
        lockingScript: imageScript.toHex(),
        outputDescription: `Sponsor image for ${slotId}`,
        satoshis: 1,
      },
      {
        lockingScript: new P2PKH().lock(SPONSOR_PAYMENT_ADDRESS).toHex(),
        outputDescription: `BitPlan sponsor payment for ${slotId}`,
        satoshis: quote.priceSats,
      },
    ],
  });
  if (!(result.txid && result.tx)) {
    throw new Error("The wallet did not return a signed transaction.");
  }
  return { beef: new Uint8Array(Array.from(result.tx)), txid: result.txid };
}
