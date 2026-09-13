import { isHostedId } from "./hosted-id";
import { normalizeIdentityKey } from "./sharing";

export type PlanAuthority = "owner" | "publisher" | "connected";
const PUBLIC_PLAN_ID = /^(?:h_[a-zA-Z0-9_-]{20}|[a-f0-9]{64}_\d+)$/;

/** Encryption identity is not a hosted write secret or proof of coin ownership. */
export function planAuthority(
  origin: string,
  identity: string,
  sender: string,
  holdsLatest: boolean
): PlanAuthority {
  const key = normalizeIdentityKey(identity);
  if (!key) {
    return "connected";
  }
  if (!isHostedId(origin)) {
    return holdsLatest ? "owner" : "connected";
  }
  return key === normalizeIdentityKey(sender) ? "publisher" : "connected";
}

export function publicationPrompt(origin: string, onChain: boolean): string {
  // Public locator only. Never copy reader or collaboration URL fragments.
  if (!PUBLIC_PLAN_ID.test(origin)) {
    throw new Error("Use a public plan ID, not a private invitation.");
  }
  return `Use the bitplan.dev skill to ${onChain ? "prepare an on-chain publication" : "save a new hosted version"} of plan ${origin}.
Read the latest document and accessible annotations together, including live text edits. Record the version and change cursor; reconcile newer edits before publishing. Preserve existing readers and original annotation records. Do not substitute a stale local HTML file or assume CLI fetch includes annotation layers.
Use your own authorized identity or an explicitly authorized browser session. If access is missing, ask for your public key to be invited; do not request private keys or extract browser credentials.
Verify the publishing wallet and ${isHostedId(origin) ? "the saved hosted-update authority" : "ownership of the latest ordinal"}. ${onChain ? "Present the exact content, recipients, assets, fee and any checkpoint limitations for approval before signing. Do not claim annotation checkpoints are included unless the publishing and recovery path supports them." : "Keep this update hosted; do not inscribe or spend BSV."} If the necessary authority or live layers are unavailable, report the gap before changing anything.`;
}
