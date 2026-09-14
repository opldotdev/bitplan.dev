"use client";

import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  connectBrowserWallet,
  getConnectedWalletClient,
  onWalletChange,
  reconnectAuthenticatedWallet,
} from "@/lib/wallet";

export function WalletSettings() {
  const [identity, setIdentity] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let generation = 0;
    async function read() {
      generation += 1;
      const run = generation;
      const wallet = getConnectedWalletClient();
      setConnected(!!wallet);
      setIdentity("");
      setError("");
      if (!wallet) {
        return;
      }
      try {
        const { publicKey } = await wallet.getPublicKey({ identityKey: true });
        if (run === generation) {
          setIdentity(publicKey);
        }
      } catch {
        if (run === generation) {
          setError("Couldn’t read your wallet identity. Try again.");
        }
      }
    }
    const unsubscribe = onWalletChange(() => void read());
    void read();
    void reconnectAuthenticatedWallet();
    return () => {
      generation += 1;
      unsubscribe();
    };
  }, [retry]);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      await connectBrowserWallet();
    } catch {
      setError("Couldn’t connect. Open your BRC-100 wallet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b pb-5">
        <span className="font-serif text-xl">BRC-100 wallet</span>
        <span className="flex items-center gap-2 text-muted-foreground text-sm">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${connected ? "bg-primary" : "bg-muted-foreground/40"}`}
          />
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>
      {connected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm">Public identity key</h3>
            <Button
              aria-label="Copy public identity key"
              disabled={!identity}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(identity);
                  toast.success("Public key copied");
                } catch {
                  toast.error(
                    "Couldn’t copy. Select the key to copy it manually."
                  );
                }
              }}
              size="icon-sm"
              variant="ghost"
            >
              <Copy />
            </Button>
          </div>
          <p className="select-text break-all rounded-xl bg-muted/45 p-4 font-mono text-sm leading-relaxed">
            {identity || "Reading identity…"}
          </p>
          <p className="text-muted-foreground text-xs">
            Share this public key to receive private plans.
          </p>
        </div>
      ) : (
        <Button disabled={busy} onClick={() => void connect()}>
          {busy ? "Connecting…" : "Connect wallet"}
        </Button>
      )}
      {error ? (
        <div className="space-y-2">
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
          {connected ? (
            <Button
              onClick={() => setRetry((value) => value + 1)}
              size="sm"
              variant="ghost"
            >
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
