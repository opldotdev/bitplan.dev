"use client";

import { Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { walletOwnsDraft } from "@/lib/drafts";
import { hostedAuthority } from "@/lib/hosted-authority";
import { isHostedId } from "@/lib/hosted-id";
import { type PlanAuthority, planAuthority } from "@/lib/plan-authority";
import {
  getConnectedWallet,
  onWalletChange,
  reconnectAuthenticatedWallet,
} from "@/lib/wallet";

/** Wallet changes update controls without remounting the live document. */
export function PlanPublishing({
  origin,
  senderIdentityKey,
  latestOutpoint,
  onPublisherChange,
}: {
  origin: string;
  senderIdentityKey: string;
  latestOutpoint: string | null;
  onPublisherChange?: (publisher: boolean) => void;
}) {
  const [access, setAccess] = useState<{
    identity: string;
    role: PlanAuthority;
  } | null>(null);
  const { toggleSidebar, open, openMobile, isMobile } = useSidebar();
  const hosted = isHostedId(origin);
  useEffect(() => {
    let generation = 0;
    async function refresh() {
      generation += 1;
      const current = generation;
      const ownsHosted = !!hostedAuthority(origin);
      setAccess(ownsHosted ? { identity: "", role: "owner" } : null);
      onPublisherChange?.(ownsHosted);
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
          const role = ownsHosted
            ? "owner"
            : planAuthority(origin, publicKey, senderIdentityKey, holdsLatest);
          onPublisherChange?.(role !== "connected");
          setAccess({
            identity: publicKey,
            role,
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
    void reconnectAuthenticatedWallet();
    return () => {
      generation += 1;
      unsubscribe();
      window.removeEventListener("focus", changed);
    };
  }, [hosted, origin, senderIdentityKey, latestOutpoint, onPublisherChange]);

  return (
    <Button
      aria-controls="bitplan-annotations"
      aria-expanded={isMobile ? openMobile : open}
      aria-label="Publish"
      onClick={toggleSidebar}
      size="icon-sm"
      title={access ? `Publish · ${access.role}` : "Publish"}
      variant="ghost"
    >
      <Upload aria-hidden="true" />
    </Button>
  );
}
