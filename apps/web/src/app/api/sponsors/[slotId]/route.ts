import { NextResponse } from "next/server";

import { SponsorAlreadyListedError } from "@/lib/sponsor-duplicates";
import {
  finalizeSponsorReceipt,
  TerminalSponsorRelayError,
} from "@/lib/sponsor-finalize";
import {
  quoteSponsorSlot,
  SponsorQuoteUnavailableError,
} from "@/lib/sponsor-quote";
import {
  InvalidSponsorReceiptError,
  sponsorTierForSlot,
} from "@/lib/sponsor-receipt";
import { RequestBodyError, readAtomicBeef } from "@/lib/sponsor-request";
import {
  isSponsorSlotClaimed,
  SponsorSlotClaimedError,
  SponsorStorageUnavailableError,
} from "@/lib/sponsor-storage";
import { SPONSOR_LINK_SLOT_ID } from "@/lib/sponsors";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { headers: NO_STORE_HEADERS, status });
}

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ slotId: string }> }
): Promise<Response> {
  const { slotId } = await params;
  if (!sponsorTierForSlot(slotId) || slotId === SPONSOR_LINK_SLOT_ID) {
    return new Response(null, { headers: NO_STORE_HEADERS, status: 404 });
  }
  try {
    const claimed = await isSponsorSlotClaimed(slotId);
    return new Response(null, {
      headers: NO_STORE_HEADERS,
      status: claimed ? 200 : 404,
    });
  } catch {
    return new Response(null, { headers: NO_STORE_HEADERS, status: 503 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slotId: string }> }
): Promise<NextResponse> {
  const { slotId } = await params;
  if (!sponsorTierForSlot(slotId) || slotId === SPONSOR_LINK_SLOT_ID) {
    return json({ error: "Unknown sponsor slot." }, 404);
  }
  try {
    if (await isSponsorSlotClaimed(slotId)) {
      return json({ error: "Sponsor slot is sold." }, 409);
    }
    return json(await quoteSponsorSlot(slotId), 200);
  } catch (error) {
    if (error instanceof SponsorStorageUnavailableError) {
      return json({ error: error.message }, 503);
    }
    if (error instanceof SponsorQuoteUnavailableError) {
      return json({ error: error.message }, 503);
    }
    return json({ error: "Could not quote this sponsor slot." }, 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slotId: string }> }
): Promise<NextResponse> {
  const { slotId } = await params;
  if (!sponsorTierForSlot(slotId) || slotId === SPONSOR_LINK_SLOT_ID) {
    return json({ error: "Unknown sponsor slot." }, 404);
  }

  try {
    const beef = await readAtomicBeef(request);
    const receipt = await finalizeSponsorReceipt(slotId, beef);
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
    if (error instanceof SponsorSlotClaimedError) {
      return json({ error: "Sponsor slot is sold." }, 409);
    }
    if (error instanceof SponsorAlreadyListedError) {
      return json({ error: error.message }, 409);
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
    return json({ error: "Could not finalize sponsorship." }, 500);
  }
}
