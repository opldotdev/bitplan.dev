import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SponsorSlot({
  slotClassName,
  slotId,
  tierName,
}: {
  slotClassName: string;
  slotId: string;
  tierName: string;
}) {
  return (
    <Button
      aria-label={`${tierName} sponsor slot ${slotId}; sponsorships are not yet available`}
      className={cn(
        "h-auto w-full border-dashed px-2 text-muted-foreground uppercase",
        slotClassName
      )}
      disabled
      type="button"
      variant="outline"
    >
      Coming soon
    </Button>
  );
}
