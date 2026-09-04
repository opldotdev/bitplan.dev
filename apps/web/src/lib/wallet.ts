import type { WalletInterface } from "@bsv/sdk";

import type { CatalogWallet } from "@/lib/catalog-client";
import type { DraftsWallet } from "@/lib/drafts";
import { playUiSound } from "@/lib/ui-sound";

/**
 * Frozen permission/audit originator for the browser BRC-100 client.
 * Carried on the WalletClient only; it must not change derived bytes.
 */
export const WALLET_ORIGINATOR = "bitplan.dev";

/**
 * Browser BRC-100 client. `WalletClient("auto", WALLET_ORIGINATOR)` races
 * the desktop bridges and the XDM transport used by extensions such as
 * Yours Wallet.
 *
 * `connectBrowserWallet` calls `waitForAuthentication` and must stay behind
 * an explicit click. The adopted client is cached for the life of the tab.
 */
let cachedClient: WalletInterface | null = null;
let cached: DraftsWallet | null = null;
let substrateAvailable = false;
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

export function getConnectedWalletClient(): WalletInterface | null {
  return cachedClient;
}

export function isWalletConnected(): boolean {
  return cached !== null;
}

/**
 * True once a BRC-100 substrate has answered in this tab, whether or not the
 * origin is authenticated yet. Stays false in browsers with no wallet.
 */
export function isWalletAvailable(): boolean {
  return substrateAvailable;
}

function markSubstrateAvailable(): void {
  if (substrateAvailable) {
    return;
  }
  substrateAvailable = true;
  notify();
}

function adopt(wallet: WalletInterface): DraftsWallet {
  cachedClient = wallet;
  // The adopted wallet also forwards createHmac/encrypt so catalog discovery
  // (frozen protocol "bitplan catalog") can run through the same client.
  // The static DraftsWallet type is unchanged; use hasCatalogSupport to
  // narrow before catalog calls.
  const capable: DraftsWallet &
    CatalogWallet &
    Pick<WalletInterface, "encrypt"> = {
    createHmac: (args) => wallet.createHmac(args),
    decrypt: (args) =>
      wallet.decrypt({
        ciphertext: args.ciphertext,
        counterparty: args.counterparty,
        keyID: args.keyID,
        protocolID: args.protocolID as [0 | 1 | 2, string],
      }),
    encrypt: (args) => wallet.encrypt(args),
    getPublicKey: (args) => wallet.getPublicKey(args),
    listOutputs: (args) => wallet.listOutputs(args),
  };
  cached = capable;
  notify();
  return capable;
}

function isGranted(result: { authenticated?: boolean }): boolean {
  return result.authenticated === true;
}

async function openClient(): Promise<WalletInterface> {
  if (cachedClient) {
    return cachedClient;
  }
  const { WalletClient } = await import("@bsv/sdk");
  const wallet = new WalletClient("auto", WALLET_ORIGINATOR);
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
      // Mark availability only after the auth probe settles so a granted
      // wallet renders as connected in the same pass, never as connectable.
      try {
        const status = await wallet.isAuthenticated({});
        if (!isGranted(status)) {
          return null;
        }
        return adopt(wallet);
      } finally {
        markSubstrateAvailable();
      }
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
    try {
      const wallet = await openClient();
      markSubstrateAvailable();
      await wallet.waitForAuthentication({});
      const adopted = adopt(wallet);
      playUiSound("notification-success");
      return adopted;
    } catch (error) {
      playUiSound("notification-error");
      throw error;
    }
  })().finally(() => {
    connectInFlight = null;
  });
  return connectInFlight;
}

/** Full BRC-100 client for explicit wallet actions such as sponsor purchases. */
export async function connectBrowserWalletClient(): Promise<WalletInterface> {
  await connectBrowserWallet();
  if (!cachedClient) {
    throw new Error("Wallet connection was not established.");
  }
  try {
    if (!isGranted(await cachedClient.isAuthenticated({}))) {
      throw new Error("Wallet session is no longer authenticated.");
    }
    return cachedClient;
  } catch (error) {
    resetWalletConnection();
    throw error;
  }
}

/** Clears the tab-local cache. Tests only. */
export function resetWalletConnection(): void {
  cachedClient = null;
  cached = null;
  substrateAvailable = false;
  reconnectInFlight = null;
  connectInFlight = null;
  notify();
}
