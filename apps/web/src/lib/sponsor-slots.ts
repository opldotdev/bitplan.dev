import { listSponsorReceipts } from "@/lib/sponsor-storage";
import { SPONSOR_SLOT_IDS, type SponsorSlotState } from "@/lib/sponsors";

export async function loadSponsorSlots(): Promise<
  ReadonlyMap<string, SponsorSlotState>
> {
  const slots = new Map<string, SponsorSlotState>(
    SPONSOR_SLOT_IDS.map((slotId) => [slotId, { slotId, status: "available" }])
  );
  try {
    for (const [slotId, receipt] of await listSponsorReceipts()) {
      slots.set(slotId, {
        slotId,
        sponsor: {
          name: receipt.name,
          slotId,
          txid: receipt.txid,
          url: receipt.href,
        },
        status: "sponsored",
      });
    }
  } catch {
    for (const slotId of SPONSOR_SLOT_IDS) {
      slots.set(slotId, {
        error: "Sponsor checkout is temporarily unavailable.",
        slotId,
        status: "paused",
      });
    }
  }
  return slots;
}
