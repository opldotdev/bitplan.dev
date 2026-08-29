import type { Metadata } from "next";

import { SponsorSlot } from "@/components/sponsor-slot";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  loadSponsorSlots,
  SPONSOR_TIERS,
  type SponsorSlotState,
  type SponsorTier,
} from "@/lib/sponsors";
import { cn } from "@/lib/utils";

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
            ~${tier.priceUsd} · {tier.imageWidth} × {tier.imageHeight}
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

export default async function SponsorsPage() {
  const slots = await loadSponsorSlots();
  const configured = slots.size > 0;

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
            Buy a unique slot with your local BRC-100 wallet and publish one
            permanent, optimized image on its 1Sat Ordinal.
          </p>
        </header>

        <div className="flex flex-col gap-12">
          <Card>
            <CardHeader>
              <CardTitle>
                {configured
                  ? "On-chain sponsorships"
                  : "Sponsorships are paused"}
              </CardTitle>
              <CardDescription>
                {configured
                  ? "Payment reserves the slot atomically. Your image, name, link, tier, and slot live in its Ordinal inscription and MAP metadata—no account or database required."
                  : "No slots are configured, so this page cannot accept payments."}
              </CardDescription>
              <CardAction>
                <Badge variant={configured ? "default" : "secondary"}>
                  {configured ? "Wallet checkout" : "Payments paused"}
                </Badge>
              </CardAction>
            </CardHeader>
          </Card>

          {SPONSOR_TIERS.map((tier) => (
            <SponsorSection key={tier.id} slots={slots} tier={tier} />
          ))}
        </div>
      </div>
    </main>
  );
}
