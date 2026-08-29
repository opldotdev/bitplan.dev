import type { ImageResponse } from "next/og";

import { formatByteSize, truncateMiddle } from "@/lib/format";
import { fetchOrdfsMeta } from "@/lib/ordfs";
import { normalizeOrigin } from "@/lib/outpoint";
import {
  OG_MUTED,
  OgFrame,
  OgHeadline,
  OgPill,
  OgWordmark,
  ogImageResponse,
  OG_SIZE as SHARED_OG_SIZE,
  OG_TYPE as SHARED_OG_TYPE,
} from "@/lib/site-og";
import { seqToVersion } from "@/lib/version";

export const OG_ALT = "Encrypted draft";
export const OG_SIZE = SHARED_OG_SIZE;
export const OG_TYPE = SHARED_OG_TYPE;

export async function encryptedDraftOgImage(
  originParam: string
): Promise<ImageResponse> {
  const origin = normalizeOrigin(originParam);
  const meta = origin ? await fetchOrdfsMeta(origin, -1) : null;
  const found = meta !== null;
  const version =
    typeof meta?.sequence === "number" ? seqToVersion(meta.sequence) : null;
  const sizeLabel =
    typeof meta?.byteLength === "number" && meta.byteLength > 0
      ? formatByteSize(meta.byteLength)
      : null;

  const headline = found || origin === null ? "Encrypted draft." : "No draft.";
  const originLabel = origin ? truncateMiddle(origin, 12, 10) : null;
  const pillParts = [
    sizeLabel,
    typeof version === "number" ? `v${version}` : null,
  ].filter((part): part is string => Boolean(part));

  return ogImageResponse(
    <OgFrame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
        }}
      >
        <OgWordmark />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <OgHeadline fontSize={92} text={headline} />
          {originLabel ? (
            <div
              style={{
                color: OG_MUTED,
                display: "flex",
                fontFamily: "Geist Mono",
                fontSize: 27,
                marginTop: 22,
              }}
            >
              {originLabel}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex" }}>
          {pillParts.length > 0 ? (
            <OgPill text={pillParts.join("  ·  ")} />
          ) : (
            <div
              style={{
                color: OG_MUTED,
                display: "flex",
                fontSize: 27,
                fontStyle: "italic",
              }}
            >
              Connect a wallet to decrypt.
            </div>
          )}
        </div>
      </div>
    </OgFrame>
  );
}
