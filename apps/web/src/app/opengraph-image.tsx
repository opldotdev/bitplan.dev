import {
  OG_MUTED,
  OG_ORANGE,
  OG_SIZE,
  OG_TYPE,
  OgFrame,
  OgWordmark,
  ogImageResponse,
} from "@/lib/site-og";

export const alt = "BitPlan — Secure agent plans on Bitcoin";
export const contentType = OG_TYPE;
export const size = OG_SIZE;

export default function Image() {
  return ogImageResponse(
    <OgFrame>
      <OgWordmark />
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "center",
          paddingBottom: 54,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 104,
            letterSpacing: "-0.02em",
            lineHeight: 1.06,
          }}
        >
          Secure agent plans
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 104,
            fontStyle: "italic",
            letterSpacing: "-0.02em",
            lineHeight: 1.06,
          }}
        >
          on Bitcoin
          <span style={{ color: OG_ORANGE, fontStyle: "normal" }}>.</span>
        </div>
        <div
          style={{
            color: OG_MUTED,
            display: "flex",
            fontSize: 32,
            marginTop: 30,
          }}
        >
          Encrypted by your wallet, inscribed as a 1Sat Ordinal.
        </div>
      </div>
    </OgFrame>
  );
}
