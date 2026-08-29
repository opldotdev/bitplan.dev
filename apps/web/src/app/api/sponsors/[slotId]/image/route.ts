import { extractSponsorImage } from "@/lib/sponsor-receipt";
import {
  readSponsorBeef,
  SponsorStorageUnavailableError,
} from "@/lib/sponsor-storage";

const IMMUTABLE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "Content-Type": "image/webp",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slotId: string }> }
): Promise<Response> {
  const { slotId } = await params;
  try {
    const beef = await readSponsorBeef(slotId);
    if (!beef) {
      return new Response(null, { status: 404 });
    }
    const image = extractSponsorImage(beef, slotId);
    return new Response(image.slice().buffer as ArrayBuffer, {
      headers: IMMUTABLE_HEADERS,
      status: 200,
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return new Response(null, { status: 404 });
    }
    if (error instanceof SponsorStorageUnavailableError) {
      return new Response(null, { status: 503 });
    }
    return new Response(null, { status: 500 });
  }
}
