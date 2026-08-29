import { type NextRequest, NextResponse } from "next/server";

import {
  listSponsorLinkRefs,
  readSponsorLinkSummaries,
  rotateSponsorLinks,
} from "@/lib/sponsor-links";
import { SponsorStorageUnavailableError } from "@/lib/sponsor-storage";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
};

function readPositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * The rotated, paginated link wall. Order is first come, first served, and
 * the whole list rotates one step per hour so every link takes a turn at
 * the top.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const offset = readPositiveInt(request.nextUrl.searchParams.get("offset"), 0);
  const limit = Math.min(
    Math.max(
      readPositiveInt(
        request.nextUrl.searchParams.get("limit"),
        DEFAULT_PAGE_SIZE
      ),
      1
    ),
    MAX_PAGE_SIZE
  );

  try {
    const refs = rotateSponsorLinks(await listSponsorLinkRefs(), Date.now());
    const page = refs.slice(offset, offset + limit);
    const items = await readSponsorLinkSummaries(page);
    const nextOffset = offset + limit < refs.length ? offset + limit : null;
    return NextResponse.json(
      { items, nextOffset, total: refs.length },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof SponsorStorageUnavailableError) {
      return NextResponse.json(
        { error: error.message },
        { headers: { "Cache-Control": "no-store" }, status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Sponsor links are temporarily unavailable." },
      { headers: { "Cache-Control": "no-store" }, status: 500 }
    );
  }
}
