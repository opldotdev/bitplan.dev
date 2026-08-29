import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

interface AuthResult {
  authenticated?: boolean;
}

let connectToSubstrateCalls = 0;
let isAuthenticatedCalls = 0;
let waitForAuthenticationCalls = 0;
let isAuthenticatedImpl: () => Promise<AuthResult> = () =>
  Promise.resolve({ authenticated: true });
let waitForAuthenticationImpl: () => Promise<AuthResult> = () =>
  Promise.resolve({ authenticated: true });
let connectImpl: () => Promise<void> = () => Promise.resolve();

mock.module("@bsv/sdk", () => ({
  P2PKH: class {
    lock() {
      return { toHex: () => "76a9" };
    }
  },
  WalletClient: class {
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
    decrypt() {
      return Promise.resolve({ plaintext: [] });
    }
    listOutputs() {
      return Promise.resolve({ outputs: [] });
    }
    createAction() {
      return Promise.resolve({ txid: "ab".repeat(32) });
    }
  },
}));

const {
  connectBrowserWallet,
  getConnectedWallet,
  isWalletConnected,
  reconnectAuthenticatedWallet,
  resetWalletConnection,
  walletErrorMessage,
} = await import("./wallet");

beforeEach(() => {
  resetWalletConnection();
  connectToSubstrateCalls = 0;
  isAuthenticatedCalls = 0;
  waitForAuthenticationCalls = 0;
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

  test("returns null when no wallet answers", async () => {
    connectImpl = () =>
      Promise.reject(
        new Error("No wallet available over any communication substrate.")
      );
    const wallet = await reconnectAuthenticatedWallet();
    expect(wallet).toBeNull();
    expect(isWalletConnected()).toBe(false);
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

describe("walletErrorMessage", () => {
  test("turns a createAction insufficient-funds blob into a short line", () => {
    const blob = JSON.stringify({
      args: { description: "BitPlan Diamond sponsor" },
      call: "createAction",
      message:
        "Storage method createAction failed: Insufficient funds in the available inputs to cover the cost of the required outputs and the transaction fee (2999122228 more satoshis are needed, for a total of 3002101779), plus whatever would be required in order to pay the fee to unlock and spend the outputs used to provide the additional satoshis.",
    });
    expect(walletErrorMessage(new Error(blob))).toBe(
      "Not enough BSV in this wallet."
    );
    expect(walletErrorMessage(blob)).not.toContain("createAction");
    expect(walletErrorMessage(blob)).not.toContain("satoshis");
  });

  test("maps a cancelled action", () => {
    expect(walletErrorMessage(new Error("Action aborted by user"))).toBe(
      "Payment cancelled."
    );
  });

  test("maps a missing wallet", () => {
    expect(
      walletErrorMessage(
        new Error("No wallet available over any communication substrate.")
      )
    ).toBe("No wallet answered. Start BSV Desktop and try again.");
  });

  test("never returns a JSON blob", () => {
    expect(walletErrorMessage(new Error('{"call":"createAction"}'))).toBe(
      "Payment failed."
    );
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
});
