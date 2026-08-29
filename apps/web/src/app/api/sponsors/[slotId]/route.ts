import { NextResponse } from "next/server";

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
  MAX_SPONSOR_BEEF_BYTES,
  sponsorTierForSlot,
} from "@/lib/sponsor-receipt";
import {
  isSponsorSlotClaimed,
  SponsorSlotClaimedError,
  SponsorStorageUnavailableError,
} from "@/lib/sponsor-storage";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

class RequestBodyError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readAtomicBeef(request: Request): Promise<Uint8Array> {
  if (
    request.headers.get("content-type")?.split(";", 1)[0] !==
    "application/octet-stream"
  ) {
    throw new RequestBodyError(415, "Expected application/octet-stream.");
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_SPONSOR_BEEF_BYTES
  ) {
    throw new RequestBodyError(413, "Atomic BEEF exceeds 1 MiB.");
  }
  if (!request.body) {
    throw new RequestBodyError(400, "Atomic BEEF body is required.");
  }

  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const value of request.body) {
    length += value.length;
    if (length > MAX_SPONSOR_BEEF_BYTES) {
      throw new RequestBodyError(413, "Atomic BEEF exceeds 1 MiB.");
    }
    chunks.push(value);
  }
  if (length === 0) {
    throw new RequestBodyError(400, "Atomic BEEF body is required.");
  }

  const beef = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    beef.set(chunk, offset);
    offset += chunk.length;
  }
  return beef;
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { headers: NO_STORE_HEADERS, status });
}

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ slotId: string }> }
): Promise<Response> {
  const { slotId } = await params;
  if (!sponsorTierForSlot(slotId)) {
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
  if (!sponsorTierForSlot(slotId)) {
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
  if (!sponsorTierForSlot(slotId)) {
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
