"use client";

import { Copy, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { walletOwnsDraft } from "@/lib/drafts";
import { truncateMiddle } from "@/lib/format";
import { isHostedId } from "@/lib/hosted-id";
import {
  type PlanAuthority,
  planAuthority,
  publicationPrompt,
} from "@/lib/plan-authority";
import { getConnectedWallet, onWalletChange } from "@/lib/wallet";

/** Wallet changes update controls without remounting the live document. */
export function PlanPublishing({
  origin,
  senderIdentityKey,
  latestOutpoint,
}: {
  origin: string;
  senderIdentityKey: string;
  latestOutpoint: string | null;
}) {
  const [access, setAccess] = useState<{
    identity: string;
    role: PlanAuthority;
  } | null>(null);
  const [onChain, setOnChain] = useState(false);
  const hosted = isHostedId(origin);
  useEffect(() => {
    let generation = 0;
    async function refresh() {
      generation += 1;
      const current = generation;
      setAccess(null);
      const wallet = getConnectedWallet();
      if (!wallet) {
        return;
      }
      try {
        const { publicKey } = await wallet.getPublicKey({ identityKey: true });
        const holdsLatest = hosted
          ? false
          : await walletOwnsDraft(wallet, origin, latestOutpoint);
        if (current === generation && getConnectedWallet() === wallet) {
          setAccess({
            identity: publicKey,
            role: planAuthority(
              origin,
              publicKey,
              senderIdentityKey,
              holdsLatest
            ),
          });
        }
      } catch {
        // Missing wallet permission must not become an ownership claim.
      }
    }
    const changed = () => void refresh();
    const unsubscribe = onWalletChange(changed);
    window.addEventListener("focus", changed);
    changed();
    return () => {
      generation += 1;
      unsubscribe();
      window.removeEventListener("focus", changed);
    };
  }, [hosted, origin, senderIdentityKey, latestOutpoint]);

  if (!access || access.role === "connected") {
    return null;
  }
  const owner = access.role === "owner";
  const label = owner ? "Owner" : "Publishing wallet";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`${label} · Publish options`}
          size="icon-sm"
          title={`${label} · Publish options`}
          variant="ghost"
        >
          <Upload aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm">{label}</p>
          <span
            className="font-mono text-muted-foreground text-xs"
            title={access.identity}
          >
            {truncateMiddle(access.identity)}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          {owner
            ? "Your wallet holds the latest plan ordinal. Publishing rechecks ownership."
            : "Your key matches this version’s encryption sender. Updating the draft also needs its saved publishing secret."}
        </p>
        {hosted ? (
          <label className="grid gap-1 text-sm">
            Destination
            <select
              className="h-9 rounded-md border bg-background px-2"
              onChange={(event) => setOnChain(event.target.value === "chain")}
              value={onChain ? "chain" : "draft"}
            >
              <option value="draft">Draft</option>
              <option value="chain">On Chain</option>
            </select>
          </label>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Publish with your agent and the BitPlan CLI. This handoff includes no
          secret keys and does not publish or sign anything here.
        </p>
        <Button
          className="w-full"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                publicationPrompt(origin, !hosted || onChain)
              );
              toast.success("Publishing instructions copied");
            } catch {
              toast.error("Could not copy publishing instructions");
            }
          }}
          size="sm"
        >
          <Copy aria-hidden="true" />
          Copy agent instructions
        </Button>
      </PopoverContent>
    </Popover>
  );
}
