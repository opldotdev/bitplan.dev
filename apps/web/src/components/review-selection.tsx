import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReviewSelection({
  included,
  onToggle,
}: {
  included: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      aria-label="Include in next revision"
      aria-pressed={included}
      className="h-7 shrink-0 gap-1.5 rounded-full px-2.5 text-muted-foreground text-xs aria-pressed:bg-primary/10 aria-pressed:text-primary"
      onClick={onToggle}
      size="sm"
      title={
        included
          ? "Exclude from the next revision"
          : "Include in the next revision"
      }
      variant="ghost"
    >
      {included ? <Check className="size-3" /> : <Minus className="size-3" />}
      {included ? "Included" : "Skipped"}
    </Button>
  );
}
