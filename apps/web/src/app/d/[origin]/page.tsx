import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { DraftResolving, DraftViewer } from "@/components/draft-viewer";
import { draftShareDescription } from "@/lib/format";
import { readHostedRecord } from "@/lib/hosted";
import { isHostedId } from "@/lib/hosted-id";
import { fetchOrdfsMeta } from "@/lib/ordfs";
import { normalizeOrigin } from "@/lib/outpoint";
import { seqToVersion } from "@/lib/version";

/** Hosted drafts read their own store; chain drafts ask ORDFS. */
async function draftMeta(
  origin: string
): Promise<{ byteLength?: number | null; sequence: number | null } | null> {
  if (!isHostedId(origin)) {
    return fetchOrdfsMeta(origin, -1);
  }
  const record = await readHostedRecord(origin);
  if (!record) {
    return null;
  }
  return {
    byteLength: record.bytes.at(-1) ?? null,
    sequence: record.versions - 1,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ origin: string }>;
}): Promise<Metadata> {
  const { origin: originParam } = await params;
  const origin = normalizeOrigin(originParam);
  const meta = origin ? await draftMeta(origin) : null;
  const description = draftShareDescription({
    byteLength: meta?.byteLength,
    found: meta !== null,
    origin,
    version:
      typeof meta?.sequence === "number" ? seqToVersion(meta.sequence) : null,
  });
  let title = "No draft";
  if (origin && isHostedId(origin)) {
    title = "Hosted draft";
  } else if (meta || !origin) {
    title = "Encrypted draft";
  }

  return {
    description,
    openGraph: { description, title },
    robots: { follow: false, index: false },
    title,
    twitter: { card: "summary_large_image", description },
  };
}

export default async function DraftPage({
  params,
}: {
  params: Promise<{ origin: string }>;
}) {
  const { origin: originParam } = await params;
  const origin = normalizeOrigin(originParam);
  if (origin && isHostedId(origin)) {
    const record = await readHostedRecord(origin);
    if (record?.origin) {
      permanentRedirect(`/d/${record.origin}`);
    }
  }

  return (
    <Suspense fallback={<DraftResolving />}>
      <DraftViewer />
    </Suspense>
  );
}
