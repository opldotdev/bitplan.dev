import { createContext, defaultPayAddress } from "@1sat/actions";
import { buildInscriptionScript } from "@1sat/templates";
import { P2PKH, type WalletInterface } from "@bsv/sdk";

import {
  SPONSOR_APP,
  SPONSOR_CONTENT_TYPE,
  SPONSOR_PAYMENT_ADDRESS,
  type SponsorTier,
  sponsorPriceSats,
  sponsorSubtype,
} from "@/lib/sponsors";

export interface SponsorCheckout {
  beef: Uint8Array<ArrayBuffer>;
  txid: string;
}

export async function createSponsorCheckout({
  image,
  name,
  slotId,
  tier,
  url,
  wallet,
}: {
  image: Uint8Array;
  name: string;
  slotId: string;
  tier: SponsorTier;
  url: string;
  wallet: WalletInterface;
}): Promise<SponsorCheckout> {
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
        href: url,
        schema: 1,
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
        satoshis: sponsorPriceSats(slotId, tier),
      },
    ],
  });
  if (!(result.txid && result.tx)) {
    throw new Error("The wallet did not return a signed transaction.");
  }
  return { beef: new Uint8Array(Array.from(result.tx)), txid: result.txid };
}
