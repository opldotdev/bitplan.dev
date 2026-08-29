import { ImageResponse } from "next/og";

import { formatByteSize, truncateMiddle } from "@/lib/format";
import { fetchOrdfsMeta } from "@/lib/ordfs";
import { normalizeOrigin } from "@/lib/outpoint";
import { seqToVersion } from "@/lib/version";

export const OG_ALT = "Encrypted draft";
export const OG_SIZE = { height: 630, width: 1200 };
export const OG_TYPE = "image/png";

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

  return new ImageResponse(
    <div
      style={{
        background:
          "linear-gradient(165deg, #241c18 0%, #12100e 55%, #0c0b0a 100%)",
        color: "#f4efe8",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 80px",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: "Geist",
          fontSize: 32,
          fontWeight: 600,
        }}
      >
        BitPlan
        <span style={{ color: "#e8632c" }}>.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Geist",
            fontSize: 72,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
        >
          {headline}
        </div>
        {originLabel ? (
          <div
            style={{
              color: "#9a9084",
              display: "flex",
              fontFamily: "Geist Mono",
              fontSize: 28,
              marginTop: 18,
            }}
          >
            {originLabel}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex" }}>
        {pillParts.length > 0 ? (
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              color: "#d4cfc6",
              display: "flex",
              fontFamily: "Geist Mono",
              fontSize: 26,
              padding: "14px 22px",
            }}
          >
            {pillParts.join("  ·  ")}
          </div>
        ) : (
          <div
            style={{
              color: "#9a9084",
              display: "flex",
              fontFamily: "Geist",
              fontSize: 24,
            }}
          >
            Connect a wallet to decrypt.
          </div>
        )}
      </div>
    </div>,
    {
      height: OG_SIZE.height,
      width: OG_SIZE.width,
    }
  );
}
