"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { fetchBsvUsdRate, sponsorAddress, usdToSatoshis } from "@/lib/sponsors";
import { cn } from "@/lib/utils";
import { sendSponsorshipPayment } from "@/lib/wallet";

export function SponsorSlot({
  slotClassName,
  slotId,
  tierName,
  usd,
}: {
  slotClassName: string;
  slotId: string;
  tierName: string;
  usd: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txid, setTxid] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const address = sponsorAddress();
      const rate = await fetchBsvUsdRate();
      const satoshis = usdToSatoshis(usd, rate);
      const paid = await sendSponsorshipPayment({
        address,
        description: `BitPlan ${tierName} sponsor`,
        outputDescription: `${tierName} sponsor slot`,
        satoshis,
      });
      setTxid(paid.txid);
      toast.success("Sponsorship paid");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [busy, tierName, usd]);

  if (txid) {
    return (
      <div
        className={cn(
          "flex h-auto w-full items-center justify-center border border-dashed px-2 text-center font-mono text-muted-foreground text-xs uppercase",
          slotClassName
        )}
      >
        Paid {txid.slice(0, 8)}…
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <Button
        aria-label={`Sponsor BitPlan at the ${tierName} tier, slot ${slotId}`}
        className={cn(
          "h-auto w-full border-dashed px-2 text-muted-foreground uppercase hover:border-foreground/40",
          slotClassName
        )}
        disabled={busy}
        onClick={handleClick}
        type="button"
        variant="outline"
      >
        {busy ? "Paying…" : "Be here"}
      </Button>
      {error ? (
        <p className="text-center text-destructive text-xs">{error}</p>
      ) : null}
    </div>
  );
}
