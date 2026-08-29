import { OneSatServices } from "@1sat/client";
import { Transaction } from "@bsv/sdk";
import {
  quoteSponsorSlot,
  sponsorPaymentMatchesQuote,
} from "@/lib/sponsor-quote";
import {
  InvalidSponsorReceiptError,
  type SponsorReceipt,
  validateSponsorReceipt,
} from "@/lib/sponsor-receipt";
import {
  claimSponsorSlot,
  readStoredSponsorReceipt,
  releaseSponsorSlot,
  SponsorSlotClaimedError,
  type StoredSponsorReceipt,
} from "@/lib/sponsor-storage";

export interface SponsorFinalization extends SponsorReceipt {
  relayed: boolean;
}

interface FinalizeDependencies {
  claim: (slotId: string, beef: Uint8Array) => Promise<string>;
  quote?: typeof quoteSponsorSlot;
  read: (slotId: string) => Promise<StoredSponsorReceipt | null>;
  relay: (beef: Uint8Array) => Promise<void>;
  release: (slotId: string, etag: string) => Promise<void>;
}

async function claimReceipt(
  slotId: string,
  beef: Uint8Array,
  receipt: SponsorReceipt,
  dependencies: FinalizeDependencies
): Promise<string> {
  const existing = await dependencies.read(slotId);
  if (existing) {
    if (!sameBytes(existing.beef, beef)) {
      throw new SponsorSlotClaimedError(slotId);
    }
    return existing.etag;
  }

  if (dependencies.quote) {
    const current = await dependencies.quote(slotId);
    if (!sponsorPaymentMatchesQuote(receipt.priceSats, current.priceSats)) {
      throw new InvalidSponsorReceiptError(
        "The BSV quote changed. Refresh the quote and try again."
      );
    }
  }

  try {
    return await dependencies.claim(slotId, beef);
  } catch (error) {
    if (!(error instanceof SponsorSlotClaimedError)) {
      throw error;
    }
    const stored = await dependencies.read(slotId);
    if (!(stored && sameBytes(stored.beef, beef))) {
      throw error;
    }
    return stored.etag;
  }
}

export class TerminalSponsorRelayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TerminalSponsorRelayError";
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.length === right.length &&
    left.every((byte, index) => byte === right[index])
  );
}

export async function relaySponsorBeef(beef: Uint8Array): Promise<void> {
  const txid = Transaction.fromAtomicBEEF(beef).id("hex");
  const services = new OneSatServices(
    "main",
    process.env.NEXT_PUBLIC_ORDFS_GATEWAY_URL
  );
  try {
    const status = await services.submitToStack(beef);
    if (!status.txid || status.txid !== txid) {
      throw new Error("Relay did not confirm the submitted transaction ID.");
    }
    if (
      status.txStatus === "REJECTED" ||
      status.txStatus === "DOUBLE_SPEND_ATTEMPTED"
    ) {
      throw new TerminalSponsorRelayError(
        status.extraInfo || `Relay returned ${status.txStatus}.`
      );
    }
  } finally {
    services.close();
  }
}

export async function finalizeSponsorReceipt(
  slotId: string,
  beef: Uint8Array,
  dependencies: FinalizeDependencies = {
    claim: claimSponsorSlot,
    quote: quoteSponsorSlot,
    read: readStoredSponsorReceipt,
    relay: relaySponsorBeef,
    release: releaseSponsorSlot,
  }
): Promise<SponsorFinalization> {
  const receipt = validateSponsorReceipt(beef, slotId);
  const etag = await claimReceipt(slotId, beef, receipt, dependencies);

  let relayed = true;
  try {
    await dependencies.relay(beef);
  } catch (error) {
    if (error instanceof TerminalSponsorRelayError) {
      await dependencies.release(slotId, etag);
      throw error;
    }
    // Retain the receipt so the exact same BEEF can retry relay safely.
    relayed = false;
  }
  return { ...receipt, relayed };
}
