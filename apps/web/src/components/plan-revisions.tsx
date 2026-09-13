"use client";

import { ArrowUpRight, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseEnvelope } from "@/lib/envelope";
import { linkWallet, parseLinkFragment } from "@/lib/link-reader";
import { fetchOrdfsContent } from "@/lib/ordfs";
import { getConnectedWalletClient, onWalletChange } from "@/lib/wallet";

const accessLabels = {
  available: "Open revision",
  checking: "Checking access…",
  locked: "No matching wallet or link key",
  unknown: "Couldn’t verify access",
};

async function availableIdentities() {
  const reader = parseLinkFragment(window.location.hash);
  const clients = [
    getConnectedWalletClient(),
    reader ? linkWallet(reader) : null,
  ];
  const keys = await Promise.all(
    clients.map(async (client) => {
      if (!client) {
        return "";
      }
      try {
        return (
          await client.getPublicKey({ identityKey: true })
        ).publicKey.toLowerCase();
      } catch {
        return "";
      }
    })
  );
  return keys.filter(Boolean);
}

async function revisionAccess(
  origin: string,
  version: number,
  identities: string[]
) {
  try {
    const result = await fetchOrdfsContent(origin, version - 1);
    if (result.state !== "found") {
      return "unknown";
    }
    return parseEnvelope(result.content.bytes).header.key.slots.some((slot) =>
      identities.includes(slot.identityKey.toLowerCase())
    )
      ? "available"
      : "locked";
  } catch {
    return "unknown";
  }
}

export function PlanRevisions({
  origin,
  currentVersion,
  latestVersion,
  onVersion,
}: {
  origin: string;
  currentVersion: number;
  latestVersion: number;
  onVersion: (version: number) => void;
}) {
  const [access, setAccess] = useState<
    Record<number, "available" | "locked" | "unknown">
  >({});
  useEffect(() => {
    let generation = 0;
    async function check() {
      generation += 1;
      const run = generation;
      setAccess({});
      const identities = await availableIdentities();
      for (let version = latestVersion; version >= 1; version -= 1) {
        if (run !== generation) {
          return;
        }
        if (version === currentVersion) {
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: bound envelope downloads and stop when the menu closes
        const status = await revisionAccess(origin, version, identities);
        if (run !== generation) {
          return;
        }
        setAccess((previous) => ({ ...previous, [version]: status }));
      }
    }
    void check();
    const unsubscribe = onWalletChange(() => void check());
    return () => {
      generation += 1;
      unsubscribe();
    };
  }, [origin, currentVersion, latestVersion]);
  return (
    <div className="plan-scroll scroll-fade min-h-0 flex-1 overflow-y-auto pb-8">
      {Array.from(
        { length: latestVersion },
        (_, index) => latestVersion - index
      ).map((version) => {
        const current = version === currentVersion;
        const status = current ? "available" : access[version];
        return (
          <Button
            className="h-auto w-full justify-between rounded-none border-border/50 border-b px-0 py-5 text-left disabled:opacity-60"
            disabled={current || status !== "available"}
            key={version}
            onClick={() => onVersion(version)}
            variant="ghost"
          >
            <span className="space-y-1">
              <span className="block font-serif text-xl">
                Version {version}
              </span>
              <span className="block text-muted-foreground text-xs">
                {current ? "Viewing now" : accessLabels[status ?? "checking"]}
              </span>
            </span>
            {status === "locked" && <Lock className="size-4" />}
            {status === "available" && !current && (
              <ArrowUpRight className="size-4" />
            )}
          </Button>
        );
      })}
    </div>
  );
}
