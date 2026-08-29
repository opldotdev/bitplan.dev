"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";

import { GitHubIcon } from "@/components/github-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  connectBrowserWallet,
  isWalletConnected,
  onWalletChange,
} from "@/lib/wallet";

function subscribeConnected(onStoreChange: () => void): () => void {
  return onWalletChange(onStoreChange);
}

const serverSnapshot = () => false;

/**
 * Wordmark, My drafts, GitHub, theme. Connect wallet is the sign-in.
 */
export function SiteHeader() {
  const connected = useSyncExternalStore(
    subscribeConnected,
    isWalletConnected,
    serverSnapshot
  );
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      await connectBrowserWallet();
      router.push("/drafts");
    } catch {
      // No wallet answered. /drafts explains how to fix it.
      router.push("/drafts");
    } finally {
      setConnecting(false);
    }
  }, [router]);

  return (
    <header className="mx-auto flex w-full max-w-[42rem] items-center justify-between px-6 py-6">
      <div className="flex items-baseline gap-6">
        <Link className="font-semibold text-foreground no-underline" href="/">
          BitPlan
          <span className="text-primary">.</span>
        </Link>
        <Link
          className="text-muted-foreground text-sm no-underline hover:text-foreground"
          href="/drafts"
        >
          My drafts
        </Link>
      </div>
      <div className="flex items-center gap-1">
        {!connected && (
          <Button
            disabled={connecting}
            onClick={connect}
            size="sm"
            type="button"
            variant="ghost"
          >
            {connecting ? "Connecting…" : "Connect wallet"}
          </Button>
        )}
        <Button asChild size="icon" variant="ghost">
          <a
            aria-label="GitHub"
            href="https://github.com/opldotdev/bitplan.dev"
            rel="noopener noreferrer"
            target="_blank"
          >
            <GitHubIcon className="size-4" />
          </a>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
