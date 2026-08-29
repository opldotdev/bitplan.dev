import type { EnvelopeWallet } from "@/lib/envelope";

/**
 * Browser BRC-100 client. `WalletClient("auto")` races window.CWI, the
 * localhost JSON/wire bridges, and XDM — see @bsv/sdk WalletClient.
 *
 * Call ONLY from an explicit user click. A drive-by page load must never
 * construct a client or touch the wallet.
 */
export async function connectBrowserWallet(): Promise<EnvelopeWallet> {
  const { WalletClient } = await import("@bsv/sdk");
  const wallet = new WalletClient("auto");
  await wallet.connectToSubstrate();
  return {
    decrypt: (args) =>
      wallet.decrypt({
        ciphertext: args.ciphertext,
        counterparty: args.counterparty,
        keyID: args.keyID,
        protocolID: args.protocolID as [0 | 1 | 2, string],
      }),
  };
}
