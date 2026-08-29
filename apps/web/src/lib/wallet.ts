import type { WalletInterface } from "@bsv/sdk";

import type { DraftsWallet } from "@/lib/drafts";

/**
 * Browser BRC-100 client. `WalletClient("auto")` races window.CWI, the
 * localhost JSON/wire bridges, and XDM — see @bsv/sdk WalletClient.
 *
 * `reconnectAuthenticatedWallet` probes `isAuthenticated` and does not prompt.
 * `connectBrowserWallet` calls `waitForAuthentication` and must stay behind
 * an explicit click. The adopted client is cached for the life of the tab.
 */
let cachedClient: WalletInterface | null = null;
let cached: DraftsWallet | null = null;
let reconnectInFlight: Promise<DraftsWallet | null> | null = null;
let connectInFlight: Promise<DraftsWallet> | null = null;
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

function adopt(wallet: WalletInterface): DraftsWallet {
  cachedClient = wallet;
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

function isGranted(result: { authenticated?: boolean }): boolean {
  return result.authenticated === true;
}

async function openClient(): Promise<WalletInterface> {
  if (cachedClient) {
    return cachedClient;
  }
  const { WalletClient } = await import("@bsv/sdk");
  const wallet = new WalletClient("auto");
  await wallet.connectToSubstrate();
  return wallet;
}

/**
 * If a BRC-100 wallet is already granted for this origin, adopt it.
 * Returns null when no wallet answers or the origin is not authenticated.
 * Does not call waitForAuthentication.
 */
export function reconnectAuthenticatedWallet(): Promise<DraftsWallet | null> {
  if (cached) {
    return Promise.resolve(cached);
  }
  if (reconnectInFlight) {
    return reconnectInFlight;
  }
  reconnectInFlight = (async () => {
    try {
      const wallet = await openClient();
      const status = await wallet.isAuthenticated({});
      if (!isGranted(status)) {
        return null;
      }
      return adopt(wallet);
    } catch {
      return null;
    } finally {
      reconnectInFlight = null;
    }
  })();
  return reconnectInFlight;
}

export async function connectBrowserWallet(): Promise<DraftsWallet> {
  if (cached) {
    return cached;
  }
  if (reconnectInFlight) {
    const existing = await reconnectInFlight;
    if (existing) {
      return existing;
    }
  }
  if (connectInFlight) {
    return connectInFlight;
  }
  connectInFlight = (async () => {
    const wallet = await openClient();
    await wallet.waitForAuthentication({});
    return adopt(wallet);
  })().finally(() => {
    connectInFlight = null;
  });
  return connectInFlight;
}

export async function sendSponsorshipPayment(input: {
  address: string;
  description: string;
  outputDescription: string;
  satoshis: number;
}): Promise<{ txid: string }> {
  await connectBrowserWallet();
  const wallet = cachedClient;
  if (!wallet) {
    throw new Error("Wallet connected without a client.");
  }
  const { P2PKH } = await import("@bsv/sdk");
  const lockingScript = new P2PKH().lock(input.address).toHex();
  const result = await wallet.createAction({
    description: input.description,
    labels: ["bitplan", "sponsor"],
    outputs: [
      {
        lockingScript,
        outputDescription: input.outputDescription,
        satoshis: input.satoshis,
        tags: ["bitplan", "sponsor"],
      },
    ],
  });
  if (!result.txid) {
    throw new Error("Wallet returned no transaction id.");
  }
  return { txid: result.txid };
}

/** Clears the tab-local cache. Tests only. */
export function resetWalletConnection(): void {
  cachedClient = null;
  cached = null;
  reconnectInFlight = null;
  connectInFlight = null;
  notify();
}
