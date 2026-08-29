import type { DraftsWallet } from "@/lib/drafts";

/**
 * Browser BRC-100 client. `WalletClient("auto")` races window.CWI, the
 * localhost JSON/wire bridges, and XDM — see @bsv/sdk WalletClient.
 *
 * Call ONLY from an explicit user click. A drive-by page load must never
 * construct a client or touch the wallet. The connected client is cached for
 * the life of the tab so navigating between pages does not re-prompt.
 */
let cached: DraftsWallet | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Subscribe to connection-state changes (for useSyncExternalStore). */
export function onWalletChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConnectedWallet(): DraftsWallet | null {
  return cached;
}

export function isWalletConnected(): boolean {
  return cached !== null;
}

export async function connectBrowserWallet(): Promise<DraftsWallet> {
  if (cached) {
    return cached;
  }
  const { WalletClient } = await import("@bsv/sdk");
  const wallet = new WalletClient("auto");
  await wallet.connectToSubstrate();
  cached = {
    decrypt: (args) =>
      wallet.decrypt({
        ciphertext: args.ciphertext,
        counterparty: args.counterparty,
        keyID: args.keyID,
        protocolID: args.protocolID as [0 | 1 | 2, string],
      }),
    listOutputs: (args) => wallet.listOutputs(args),
  };
  notify();
  return cached;
}
