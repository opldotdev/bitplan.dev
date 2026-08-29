import {
  encryptedDraftOgImage,
  OG_ALT,
  OG_SIZE,
  OG_TYPE,
} from "@/lib/encrypted-draft-og";

export const alt = OG_ALT;
export const contentType = OG_TYPE;
export const size = OG_SIZE;

export default async function Image({
  params,
}: {
  params: Promise<{ origin: string }>;
}) {
  const { origin } = await params;
  return encryptedDraftOgImage(origin);
}
