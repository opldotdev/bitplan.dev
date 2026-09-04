import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

interface AuthResult {
  authenticated?: boolean;
}

let connectToSubstrateCalls = 0;
let isAuthenticatedCalls = 0;
let waitForAuthenticationCalls = 0;
let walletConstructorArgs: unknown[][] = [];
let createHmacCalls: unknown[][] = [];
let decryptCalls: unknown[][] = [];
let isAuthenticatedImpl: () => Promise<AuthResult> = () =>
  Promise.resolve({ authenticated: true });
let waitForAuthenticationImpl: () => Promise<AuthResult> = () =>
  Promise.resolve({ authenticated: true });
let connectImpl: () => Promise<void> = () => Promise.resolve();

mock.module("@bsv/sdk", () => ({
  WalletClient: class {
    substrate: unknown;
    originator: unknown;
    constructor(substrate?: unknown, originator?: unknown) {
      this.substrate = substrate;
      this.originator = originator;
      walletConstructorArgs.push([substrate, originator]);
    }
    connectToSubstrate() {
      connectToSubstrateCalls += 1;
      return connectImpl();
    }
    isAuthenticated() {
      isAuthenticatedCalls += 1;
      return isAuthenticatedImpl();
    }
    waitForAuthentication() {
      waitForAuthenticationCalls += 1;
      return waitForAuthenticationImpl();
    }
    createHmac(args: unknown) {
      createHmacCalls.push([args, this.originator]);
      return Promise.resolve({
        hmac: Array.from({ length: 32 }, (_, i) => i),
      });
    }
    decrypt(args: unknown) {
      decryptCalls.push([args, this.originator]);
      return Promise.resolve({ plaintext: [] });
    }
    encrypt() {
      return Promise.resolve({ ciphertext: [] });
    }
    listOutputs() {
      return Promise.resolve({ outputs: [] });
    }
  },
}));

const {
  connectBrowserWallet,
  connectBrowserWalletClient,
  getConnectedWallet,
  getConnectedWalletClient,
  isWalletAvailable,
  isWalletConnected,
  reconnectAuthenticatedWallet,
  resetWalletConnection,
} = await import("./wallet");

beforeEach(() => {
  resetWalletConnection();
  connectToSubstrateCalls = 0;
  isAuthenticatedCalls = 0;
  waitForAuthenticationCalls = 0;
  walletConstructorArgs = [];
  createHmacCalls = [];
  decryptCalls = [];
  isAuthenticatedImpl = () => Promise.resolve({ authenticated: true });
  waitForAuthenticationImpl = () => Promise.resolve({ authenticated: true });
  connectImpl = () => Promise.resolve();
});

afterEach(() => {
  resetWalletConnection();
});

describe("reconnectAuthenticatedWallet", () => {
  test("adopts a wallet that is already granted for this origin", async () => {
    const wallet = await reconnectAuthenticatedWallet();
    expect(wallet).not.toBeNull();
    expect(isWalletConnected()).toBe(true);
    expect(getConnectedWallet()).toBe(wallet);
    expect(waitForAuthenticationCalls).toBe(0);
    expect(isAuthenticatedCalls).toBe(1);
  });

  test("returns null and does not cache when the origin is not granted", async () => {
    isAuthenticatedImpl = () => Promise.resolve({ authenticated: false });
    const wallet = await reconnectAuthenticatedWallet();
    expect(wallet).toBeNull();
    expect(isWalletConnected()).toBe(false);
    expect(waitForAuthenticationCalls).toBe(0);
  });

  test("marks the substrate available even when the origin is not granted", async () => {
    isAuthenticatedImpl = () => Promise.resolve({ authenticated: false });
    expect(isWalletAvailable()).toBe(false);
    await reconnectAuthenticatedWallet();
    expect(isWalletAvailable()).toBe(true);
    expect(isWalletConnected()).toBe(false);
  });

  test("marks the substrate available when the auth probe itself fails", async () => {
    isAuthenticatedImpl = () => Promise.reject(new Error("probe failed"));
    const wallet = await reconnectAuthenticatedWallet();
    expect(wallet).toBeNull();
    expect(isWalletAvailable()).toBe(true);
    expect(isWalletConnected()).toBe(false);
  });

  test("returns null when no wallet answers", async () => {
    connectImpl = () =>
      Promise.reject(
        new Error("No wallet available over any communication substrate.")
      );
    const wallet = await reconnectAuthenticatedWallet();
    expect(wallet).toBeNull();
    expect(isWalletConnected()).toBe(false);
    expect(isWalletAvailable()).toBe(false);
    expect(isAuthenticatedCalls).toBe(0);
  });

  test("coalesces concurrent probes", async () => {
    let resolveAuth: (value: AuthResult) => void = () => undefined;
    const authGate = new Promise<AuthResult>((resolve) => {
      resolveAuth = resolve;
    });
    isAuthenticatedImpl = () => authGate;
    const first = reconnectAuthenticatedWallet();
    const second = reconnectAuthenticatedWallet();
    resolveAuth({ authenticated: true });
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(connectToSubstrateCalls).toBe(1);
    expect(isAuthenticatedCalls).toBe(1);
  });
});

describe("connectBrowserWallet", () => {
  test("waits for authentication on an explicit connect", async () => {
    const wallet = await connectBrowserWallet();
    expect(wallet).not.toBeNull();
    expect(isWalletConnected()).toBe(true);
    expect(waitForAuthenticationCalls).toBe(1);
  });

  test("skips waitForAuthentication when already granted in this tab", async () => {
    await reconnectAuthenticatedWallet();
    waitForAuthenticationCalls = 0;
    await connectBrowserWallet();
    expect(waitForAuthenticationCalls).toBe(0);
  });

  test("exposes the full BRC-100 client for explicit wallet actions", async () => {
    const client = await connectBrowserWalletClient();
    expect(client).toBe(getConnectedWalletClient());
    expect(getConnectedWallet()).not.toBe(client);
  });

  test("constructs the client with the frozen bitplan.dev originator", async () => {
    const { WALLET_ORIGINATOR } = await import("./wallet");
    expect(WALLET_ORIGINATOR).toBe("bitplan.dev");
    await connectBrowserWallet();
    expect(walletConstructorArgs).toHaveLength(1);
    expect(walletConstructorArgs[0]).toEqual(["auto", "bitplan.dev"]);
  });

  test("createHmac/decrypt forward through the client carrying that originator", async () => {
    const wallet = await connectBrowserWallet();
    const client = getConnectedWalletClient() as unknown as {
      originator: unknown;
    };
    expect(client.originator).toBe("bitplan.dev");
    await wallet.createHmac({
      counterparty: "self",
      data: [1, 2, 3],
      keyID: "catalog-capability-v1",
      protocolID: [2, "bitplan catalog"],
    });
    await wallet.decrypt({
      ciphertext: [9],
      counterparty: "self",
      keyID: "catalog-content-v1",
      protocolID: [2, "bitplan catalog"],
    });
    expect(createHmacCalls).toHaveLength(1);
    expect(createHmacCalls[0]?.[1]).toBe("bitplan.dev");
    expect(decryptCalls).toHaveLength(1);
    expect(decryptCalls[0]?.[1]).toBe("bitplan.dev");
    // The originator is permission/audit context only: forwarded derivation
    // inputs carry no originator field, so derived bytes cannot change.
    expect(createHmacCalls[0]?.[0]).not.toHaveProperty("originator");
    expect(decryptCalls[0]?.[0]).not.toHaveProperty("originator");
  });

  test("forwards catalog capability calls through the adopted wallet", async () => {
    const { hasCatalogSupport } = await import("./catalog-client");
    const wallet = await connectBrowserWallet();
    expect(hasCatalogSupport(wallet)).toBe(true);
    if (!hasCatalogSupport(wallet)) {
      throw new Error("Expected catalog support.");
    }
    const hmac = await wallet.createHmac({
      counterparty: "self",
      data: [1, 2, 3],
      keyID: "catalog-capability-v1",
      protocolID: [2, "bitplan catalog"],
    });
    expect(hmac.hmac).toHaveLength(32);
  });

  test("drops a stale wallet before an explicit action", async () => {
    await connectBrowserWalletClient();
    isAuthenticatedImpl = () => Promise.resolve({ authenticated: false });

    await expect(connectBrowserWalletClient()).rejects.toThrow(
      "no longer authenticated"
    );
    expect(isWalletConnected()).toBe(false);
    expect(getConnectedWalletClient()).toBeNull();
  });
});
