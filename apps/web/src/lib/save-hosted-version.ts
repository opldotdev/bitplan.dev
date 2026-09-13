import { Hash, Utils } from "@bsv/sdk";
import {
  type DraftPlaintext,
  type EncryptingEnvelopeWallet,
  sealEnvelope,
} from "./envelope";
import { hostedAuthority } from "./hosted-authority";

/** Saves a reviewed snapshot; server-side capability and version checks remain authoritative. */
export async function saveHostedVersion(
  input: {
    id: string;
    version: number;
    plaintext: DraftPlaintext;
    wallet: EncryptingEnvelopeWallet;
    recipients: string[];
    assertCurrent: () => void;
  },
  fetchImpl: typeof fetch = fetch,
  storage?: Pick<Storage, "getItem">
): Promise<number> {
  const secret = hostedAuthority(input.id, storage);
  if (!secret) {
    throw new Error(
      "This browser does not hold this draft’s update permission. Create an owned copy instead."
    );
  }
  if (!Number.isSafeInteger(input.version) || input.version < 1) {
    throw new Error("Invalid base version.");
  }
  const htmlBytes = new TextEncoder().encode(input.plaintext.html);
  if (htmlBytes.length > 5 * 1024 * 1024) {
    throw new Error("Keep the document under 5 MB.");
  }
  const envelope = await sealEnvelope(
    input.wallet,
    {
      ...input.plaintext,
      meta: {
        ...input.plaintext.meta,
        fileSha256: Utils.toHex(Hash.sha256(Array.from(htmlBytes))),
      },
    },
    crypto.randomUUID(),
    input.recipients
  );
  input.assertCurrent();
  const response = await fetchImpl(`/api/hosted/${input.id}`, {
    body: Uint8Array.from(envelope).buffer,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-bitplan",
      "X-Bitplan-Base-Version": String(input.version),
    },
    method: "POST",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 409) {
    throw new Error(
      "A newer version exists. Reload and review it before saving."
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("This browser’s update permission was not accepted.");
  }
  if (!response.ok) {
    throw new Error(
      "Save could not be confirmed. Reload the version list before retrying."
    );
  }
  const result = await response.json();
  if (result.id !== input.id || result.version !== input.version + 1) {
    throw new Error(
      "Save returned an unexpected version. Reload before retrying."
    );
  }
  return result.version;
}
