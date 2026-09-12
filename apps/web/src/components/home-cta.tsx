"use client";

import { ExternalLink, Smartphone, Terminal, Wallet } from "lucide-react";
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
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void reconnectAuthenticatedWallet().finally(() => setChecked(true));
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
      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-center">
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
        {checked ? <WalletSuggestions /> : null}
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href="/docs">Get started</Link>
        </Button>
        {connected ? (
          <Button asChild variant="outline">
            <Link href="/drafts">My drafts</Link>
          </Button>
        ) : null}
      </div>
      {checked && !connected ? <WalletSuggestions /> : null}
    </div>
  );
}

function WalletSuggestions() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }, []);
  const options = mobile
    ? [
        {
          href: "https://desktop.bsvb.tech/",
          Icon: Smartphone,
          name: "BSV Browser",
        },
        { href: "https://handcash.io/", Icon: Wallet, name: "HandCash" },
      ]
    : [
        { href: "https://1satwallet.com/", Icon: Wallet, name: "1Sat Wallet" },
        { href: "https://yours.org/", Icon: Wallet, name: "Yours Wallet" },
      ];
  return (
    <aside
      aria-label="Wallet options"
      className="mx-auto max-w-md rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-muted-foreground text-xs"
    >
      <p>No wallet connected. Use a BRC-100 wallet to connect your identity.</p>
      <div className="mt-1 flex flex-wrap justify-center gap-1">
        {options.map(({ name, href, Icon }) => (
          <Button asChild key={name} size="sm" variant="ghost">
            <a
              href={href}
              rel="noopener noreferrer"
              target="_blank"
              title={
                name === "HandCash"
                  ? "Explore HandCash; not integrated with BitPlan"
                  : `Explore ${name}`
              }
            >
              <Icon aria-hidden="true" />
              {name}
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          </Button>
        ))}
      </div>
      <details className="mt-1 text-left">
        <summary className="cursor-pointer">Using a local CLI?</summary>
        <p className="mt-1 flex items-center gap-2">
          <Terminal aria-hidden="true" className="size-3" />
          <a
            className="underline underline-offset-4"
            href="https://desktop.bsvb.tech/"
            rel="noopener noreferrer"
            target="_blank"
          >
            BSV Desktop
          </a>
          <span>or</span>
          <a
            className="underline underline-offset-4"
            href="https://1satwallet.com/"
            rel="noopener noreferrer"
            target="_blank"
          >
            1Sat Wallet
          </a>
        </p>
      </details>
    </aside>
  );
}
