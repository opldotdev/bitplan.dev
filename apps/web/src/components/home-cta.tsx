"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  connectBrowserWallet,
  isWalletAvailable,
  isWalletConnected,
  onWalletChange,
  reconnectAuthenticatedWallet,
} from "@/lib/wallet";

function subscribeWallet(onStoreChange: () => void): () => void {
  return onWalletChange(onStoreChange);
}

const serverSnapshot = () => false;

/**
 * Hero call to action, keyed to wallet state. A BRC-100 substrate that
 * answered but is not yet granted gets a single connect button; otherwise
 * documentation is the entry point, and drafts only make sense connected.
 */
export function HomeCta() {
  const connected = useSyncExternalStore(
    subscribeWallet,
    isWalletConnected,
    serverSnapshot
  );
  const walletAvailable = useSyncExternalStore(
    subscribeWallet,
    isWalletAvailable,
    serverSnapshot
  );
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    reconnectAuthenticatedWallet();
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      await connectBrowserWallet();
      router.push("/drafts");
    } catch {
      router.push("/drafts");
    } finally {
      setConnecting(false);
    }
  }, [router]);

  if (!connected && walletAvailable) {
    return (
      <div className="mt-8 flex items-center justify-center">
        <Button
          className="px-6"
          disabled={connecting}
          onClick={connect}
          size="lg"
          type="button"
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
      <Button asChild>
        <Link href="/docs">Get started</Link>
      </Button>
      {connected ? (
        <Button asChild variant="outline">
          <Link href="/drafts">My drafts</Link>
        </Button>
      ) : null}
    </div>
  );
}
