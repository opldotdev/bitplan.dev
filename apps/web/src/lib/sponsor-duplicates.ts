import {
  listSponsorLinkRefs,
  readSponsorLinkSummaries,
} from "@/lib/sponsor-links";
import type { SponsorReceipt } from "@/lib/sponsor-receipt";
import { listSponsorReceipts } from "@/lib/sponsor-storage";
import { sponsorHostKey, sponsorNameKey } from "@/lib/sponsors";

export class SponsorAlreadyListedError extends Error {
  constructor() {
    super(
      "This sponsor is already listed. Each sponsor appears once across all placements."
    );
    this.name = "SponsorAlreadyListedError";
  }
}

interface ExistingSponsor {
  href: string;
  name: string;
}

async function listExistingSponsors(
  excludeTxid?: string
): Promise<ExistingSponsor[]> {
  const [receipts, refs] = await Promise.all([
    listSponsorReceipts(),
    listSponsorLinkRefs(),
  ]);
  const links = await readSponsorLinkSummaries(
    refs.filter((ref) => ref.txid !== excludeTxid)
  );
  return [
    ...[...receipts.values()].map(({ href, name }) => ({ href, name })),
    ...links.map(({ href, name }) => ({ href, name })),
  ];
}

/**
 * Rejects a receipt whose sponsor (by site host or by name) is already
 * listed in any image slot or link. `excludeTxid` lets a link finalize
 * retry pass its own prior publication.
 */
export async function assertSponsorNotListed(
  receipt: Pick<SponsorReceipt, "href" | "name">,
  excludeTxid?: string
): Promise<void> {
  const hostKey = sponsorHostKey(receipt.href);
  const nameKey = sponsorNameKey(receipt.name);
  const existing = await listExistingSponsors(excludeTxid);
  for (const sponsor of existing) {
    if (
      (hostKey !== null && sponsorHostKey(sponsor.href) === hostKey) ||
      sponsorNameKey(sponsor.name) === nameKey
    ) {
      throw new SponsorAlreadyListedError();
    }
  }
}
