import { parseAnnotationCheckpoint } from "./annotation-checkpoint";
import {
  type EncryptingEnvelopeWallet,
  type EnvelopeWallet,
  openPayloadEnvelope,
  sealPayloadEnvelope,
} from "./envelope";

/** Separate encrypted annotation output; never wraps it as a replacement HTML plan. */
export function sealCheckpointEnvelope(
  wallet: EncryptingEnvelopeWallet,
  checkpoint: unknown,
  keyID: string,
  recipients: readonly string[]
): Promise<Uint8Array> {
  const payload = parseAnnotationCheckpoint(checkpoint);
  return sealPayloadEnvelope(wallet, { ...payload }, keyID, recipients);
}

export async function openCheckpointEnvelope(
  wallet: EnvelopeWallet,
  bytes: Uint8Array
) {
  const { header, payload } = await openPayloadEnvelope(wallet, bytes);
  return { checkpoint: parseAnnotationCheckpoint(payload), header };
}
