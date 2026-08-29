import { ImageResponse } from "next/og";

export const OG_SIZE = { height: 630, width: 1200 };
export const OG_TYPE = "image/png";

export function siteOgImage({
  headline,
  pill,
  subhead,
}: {
  headline: string;
  pill?: string;
  subhead?: string;
}): ImageResponse {
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
        {subhead ? (
          <div
            style={{
              color: "#9a9084",
              display: "flex",
              fontFamily: "Geist",
              fontSize: 32,
              marginTop: 18,
            }}
          >
            {subhead}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex" }}>
        {pill ? (
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
            {pill}
          </div>
        ) : null}
      </div>
    </div>,
    {
      height: OG_SIZE.height,
      width: OG_SIZE.width,
    }
  );
}
