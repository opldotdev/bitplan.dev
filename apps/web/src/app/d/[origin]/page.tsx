import type { Metadata } from "next";
import { Suspense } from "react";

import { DraftResolving, DraftViewer } from "@/components/draft-viewer";
import { draftShareDescription } from "@/lib/format";
import { fetchOrdfsMeta } from "@/lib/ordfs";
import { normalizeOrigin } from "@/lib/outpoint";
import { seqToVersion } from "@/lib/version";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ origin: string }>;
}): Promise<Metadata> {
  const { origin: originParam } = await params;
  const origin = normalizeOrigin(originParam);
  const meta = origin ? await fetchOrdfsMeta(origin, -1) : null;
  const description = draftShareDescription({
    byteLength: meta?.byteLength,
    found: meta !== null,
    origin,
    version:
      typeof meta?.sequence === "number" ? seqToVersion(meta.sequence) : null,
  });
  const title = meta || !origin ? "Encrypted draft" : "No draft";

  return {
    description,
    openGraph: { description, title },
    robots: { follow: false, index: false },
    title,
    twitter: { card: "summary_large_image", description },
  };
}

export default function DraftPage() {
  return (
    <Suspense fallback={<DraftResolving />}>
      <DraftViewer />
    </Suspense>
  );
}
