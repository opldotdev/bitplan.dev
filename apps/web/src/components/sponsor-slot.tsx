import Image from "next/image";

import { SponsorDialog } from "@/components/sponsor-dialog";
import { Button } from "@/components/ui/button";
import type { SponsorSlotState, SponsorTier } from "@/lib/sponsors";
import { sponsorImageUrl } from "@/lib/sponsors";
import { cn } from "@/lib/utils";

export function SponsorSlot({
  slot,
  slotId,
  tier,
}: {
  slot?: SponsorSlotState;
  slotId: string;
  tier: SponsorTier;
}) {
  if (slot?.sponsor) {
    return (
      <Button
        asChild
        className={cn("h-auto w-full overflow-hidden p-0", tier.slotClassName)}
        variant="outline"
      >
        <a
          aria-label={`${slot.sponsor.name}, ${tier.name} sponsor`}
          href={slot.sponsor.url}
          rel="sponsored noopener noreferrer"
          target="_blank"
          title={slot.sponsor.name}
        >
          <Image
            alt={slot.sponsor.name}
            className="size-full object-cover"
            height={tier.imageHeight}
            src={sponsorImageUrl(slot.slotId)}
            unoptimized
            width={tier.imageWidth}
          />
        </a>
      </Button>
    );
  }

  if (slot?.status === "available") {
    return (
      <div className={cn("w-full", tier.slotClassName)}>
        <SponsorDialog slot={slot} tier={tier} />
      </div>
    );
  }

  const unavailableLabel = slot ? "Unavailable" : "Opening soon";

  return (
    <Button
      aria-label={`${tier.name} sponsor slot ${slotId}; ${unavailableLabel.toLowerCase()}`}
      className={cn(
        "h-auto w-full border-dashed px-2 text-muted-foreground uppercase",
        tier.slotClassName
      )}
      disabled
      title={slot?.error}
      type="button"
      variant="outline"
    >
      {unavailableLabel}
    </Button>
  );
}
