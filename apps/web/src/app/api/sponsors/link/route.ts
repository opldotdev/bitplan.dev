import { NextResponse } from "next/server";

import { SponsorAlreadyListedError } from "@/lib/sponsor-duplicates";
import {
  finalizeSponsorLinkReceipt,
  TerminalSponsorRelayError,
} from "@/lib/sponsor-finalize";
import {
  quoteSponsorSlot,
  SponsorQuoteUnavailableError,
} from "@/lib/sponsor-quote";
import { InvalidSponsorReceiptError } from "@/lib/sponsor-receipt";
import { RequestBodyError, readAtomicBeef } from "@/lib/sponsor-request";
import {
  SponsorSlotClaimedError,
  SponsorStorageUnavailableError,
} from "@/lib/sponsor-storage";
import { SPONSOR_LINK_SLOT_ID } from "@/lib/sponsors";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { headers: NO_STORE_HEADERS, status });
}

/** Link sponsorships are unlimited, so a quote is always available. */
export async function GET(): Promise<NextResponse> {
  try {
    return json(await quoteSponsorSlot(SPONSOR_LINK_SLOT_ID), 200);
  } catch (error) {
    if (error instanceof SponsorQuoteUnavailableError) {
      return json({ error: error.message }, 503);
    }
    return json({ error: "Could not quote a sponsor link." }, 500);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const beef = await readAtomicBeef(request);
    const receipt = await finalizeSponsorLinkReceipt(beef);
    return json(
      {
        imageOutpoint: receipt.imageOutpoint,
        relayed: receipt.relayed,
        txid: receipt.txid,
      },
      201
    );
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof InvalidSponsorReceiptError) {
      return json({ error: error.message }, 400);
    }
    if (error instanceof SponsorAlreadyListedError) {
      return json({ error: error.message }, 409);
    }
    if (error instanceof SponsorSlotClaimedError) {
      return json({ error: "This link was already published." }, 409);
    }
    if (error instanceof SponsorStorageUnavailableError) {
      return json({ error: error.message }, 503);
    }
    if (error instanceof SponsorQuoteUnavailableError) {
      return json({ error: error.message }, 503);
    }
    if (error instanceof TerminalSponsorRelayError) {
      return json({ error: "Transaction was rejected by the network." }, 422);
    }
    return json({ error: "Could not finalize the sponsor link." }, 500);
  }
}
