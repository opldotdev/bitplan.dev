import type { Metadata } from "next";

import { SponsorSlot } from "@/components/sponsor-slot";
import { Separator } from "@/components/ui/separator";
import { SPONSOR_TIERS, type SponsorTier } from "@/lib/sponsors";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  description:
    "One-time BSV sponsorships paid from a BRC-100 wallet. Logo and name on this page, a link to your site, and a mention in major release notes.",
  title: "Sponsors",
};

function SponsorSection({ tier }: { tier: SponsorTier }) {
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
            <SponsorSlot
              slotClassName={tier.slotClassName}
              slotId={slotId}
              tierName={tier.name}
              usd={tier.priceUsd}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function SponsorsPage() {
  return (
    <main className="flex-1 overflow-x-clip bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
        <header className="flex flex-col items-center gap-4 pb-12 text-center">
          <p className="font-semibold text-4xl">
            BitPlan
            <span className="text-primary">.</span>
          </p>
          <h1 className="font-medium text-4xl">Sponsor BitPlan</h1>
          <p className="max-w-xl text-balance text-muted-foreground">
            Keep encrypted plan documents on Bitcoin. Each tier is a one-time
            BSV payment from your BRC-100 wallet. Your name and logo go on this
            page, with a link to your site, and you get a mention in major
            release notes.
          </p>
        </header>

        <div className="flex flex-col gap-12">
          {SPONSOR_TIERS.map((tier) => (
            <SponsorSection key={tier.id} tier={tier} />
          ))}
        </div>
      </div>
    </main>
  );
}
