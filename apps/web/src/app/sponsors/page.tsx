import type { Metadata } from "next";
import Image from "next/image";

import { SponsorLinksSection } from "@/components/sponsor-links-section";
import { SponsorSlot } from "@/components/sponsor-slot";
import { Separator } from "@/components/ui/separator";
import {
  listSponsorLinkRefs,
  readSponsorLinkSummaries,
  rotateSponsorLinks,
} from "@/lib/sponsor-links";
import { loadSponsorSlots } from "@/lib/sponsor-slots";
import {
  SPONSOR_LINK_TIER,
  SPONSOR_TIERS,
  type SponsorLink,
  type SponsorSlotState,
  type SponsorTier,
} from "@/lib/sponsors";
import { cn } from "@/lib/utils";

const LINKS_PAGE_SIZE = 24;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "Sponsor BitPlan with a permanent 1Sat Ordinal.",
  title: "Sponsors",
  twitter: { card: "summary_large_image" },
};

function SponsorSection({
  slots,
  tier,
}: {
  slots: ReadonlyMap<string, SponsorSlotState>;
  tier: SponsorTier;
}) {
  return (
    <section aria-label={`${tier.name} sponsors`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono font-semibold text-muted-foreground text-xs uppercase">
            {tier.name}
          </h2>
          <p className="font-mono font-semibold text-foreground text-xs">
            ${tier.priceUsd}
          </p>
        </div>
        <Separator />
      </div>
      <ul className={cn("grid gap-3 pt-4", tier.gridClassName)}>
        {tier.slotIds.map((slotId) => (
          <li className="flex" key={slotId}>
            <SponsorSlot slot={slots.get(slotId)} slotId={slotId} tier={tier} />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function loadInitialSponsorLinks(): Promise<{
  items: SponsorLink[];
  nextOffset: number | null;
}> {
  try {
    const refs = rotateSponsorLinks(await listSponsorLinkRefs(), Date.now());
    return {
      items: await readSponsorLinkSummaries(refs.slice(0, LINKS_PAGE_SIZE)),
      nextOffset: refs.length > LINKS_PAGE_SIZE ? LINKS_PAGE_SIZE : null,
    };
  } catch {
    return { items: [], nextOffset: null };
  }
}

export default async function SponsorsPage() {
  const [slots, links] = await Promise.all([
    loadSponsorSlots(),
    loadInitialSponsorLinks(),
  ]);

  return (
    <main className="flex-1 overflow-x-clip bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
        <header className="flex flex-col items-center gap-4 pb-12 text-center">
          <Image
            alt="BitPlan"
            className="size-12 rounded-sm"
            height={48}
            priority
            src="/icon.png"
            width={48}
          />
          <h1 className="font-medium text-4xl">Sponsor BitPlan</h1>
          <p className="max-w-xl text-balance text-muted-foreground">
            Choose a placement and publish it with your BRC-100 wallet. Each
            slot is sold once.
          </p>
        </header>

        <div className="flex flex-col gap-12">
          {SPONSOR_TIERS.map((tier) => (
            <SponsorSection key={tier.id} slots={slots} tier={tier} />
          ))}
          <section aria-label="Link sponsors">
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-mono font-semibold text-muted-foreground text-xs uppercase">
                  {SPONSOR_LINK_TIER.name}
                </h2>
                <p className="font-mono font-semibold text-foreground text-xs">
                  ${SPONSOR_LINK_TIER.priceUsd}
                </p>
              </div>
              <Separator />
              <p className="text-muted-foreground text-xs">
                Unlimited placements, first come first served. The list rotates
                hourly so every link takes a turn at the top.
              </p>
            </div>
            <SponsorLinksSection
              initialItems={links.items}
              initialNextOffset={links.nextOffset}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
