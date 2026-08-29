import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactElement, ReactNode } from "react";

export const OG_SIZE = { height: 630, width: 1200 };
export const OG_TYPE = "image/png";

export const OG_CREAM = "#f4efe8";
export const OG_MUTED = "rgba(244, 239, 232, 0.78)";
export const OG_ORANGE = "#e8632c";

const assetsDir = join(process.cwd(), "assets", "og");
const backdrop = `data:image/jpeg;base64,${(
  await readFile(join(assetsDir, "backdrop.jpg"))
).toString("base64")}`;
const fraunces = await readFile(join(assetsDir, "fraunces-semibold.ttf"));
const frauncesItalic = await readFile(
  join(assetsDir, "fraunces-semibold-italic.ttf")
);
const geistMono = await readFile(join(assetsDir, "geist-mono-medium.ttf"));

const OG_FONTS = [
  {
    data: fraunces,
    name: "Fraunces",
    style: "normal" as const,
    weight: 600 as const,
  },
  {
    data: frauncesItalic,
    name: "Fraunces",
    style: "italic" as const,
    weight: 600 as const,
  },
  {
    data: geistMono,
    name: "Geist Mono",
    style: "normal" as const,
    weight: 500 as const,
  },
];

export function ogImageResponse(element: ReactElement): ImageResponse {
  return new ImageResponse(element, {
    fonts: OG_FONTS,
    height: OG_SIZE.height,
    width: OG_SIZE.width,
  });
}

/** The site wordmark, sized for a card corner. */
export function OgWordmark() {
  return (
    <div style={{ display: "flex", fontSize: 36 }}>
      BitPlan
      <span style={{ color: OG_ORANGE }}>.</span>
    </div>
  );
}

/**
 * The watercolor library behind every share card, with the homepage hero's
 * scrim so type stays readable at thumbnail size.
 */
export function OgFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        color: OG_CREAM,
        display: "flex",
        fontFamily: "Fraunces",
        fontStyle: "normal",
        fontWeight: 600,
        height: "100%",
        position: "relative",
        width: "100%",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: satori renders plain elements */}
      {/* biome-ignore lint/a11y/useAltText: decorative backdrop in a generated image */}
      <img
        height={OG_SIZE.height}
        src={backdrop}
        style={{ left: 0, position: "absolute", top: 0 }}
        width={OG_SIZE.width}
      />
      <div
        style={{
          background:
            "linear-gradient(to bottom, rgba(18,16,14,0.62) 0%, rgba(18,16,14,0.34) 42%, rgba(10,9,8,0.88) 100%)",
          height: "100%",
          left: 0,
          position: "absolute",
          top: 0,
          width: "100%",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "64px 76px",
          position: "relative",
          width: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** A headline whose trailing period takes the brand orange. */
export function OgHeadline({
  fontSize,
  text,
}: {
  fontSize: number;
  text: string;
}) {
  const dotted = text.endsWith(".");
  const body = dotted ? text.slice(0, -1) : text;
  return (
    <div
      style={{
        display: "flex",
        fontSize,
        letterSpacing: "-0.02em",
        lineHeight: 1.05,
      }}
    >
      {body}
      {dotted ? <span style={{ color: OG_ORANGE }}>.</span> : null}
    </div>
  );
}

export function OgPill({ text }: { text: string }) {
  return (
    <div
      style={{
        background: "rgba(10, 9, 8, 0.55)",
        border: "1px solid rgba(244, 239, 232, 0.28)",
        borderRadius: 14,
        color: OG_CREAM,
        display: "flex",
        fontFamily: "Geist Mono",
        fontSize: 25,
        padding: "14px 24px",
      }}
    >
      {text}
    </div>
  );
}

export function siteOgImage({
  headline,
  pill,
  subhead,
}: {
  headline: string;
  pill?: string;
  subhead?: string;
}): ImageResponse {
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
          {subhead ? (
            <div
              style={{
                color: OG_MUTED,
                display: "flex",
                fontSize: 31,
                marginTop: 22,
              }}
            >
              {subhead}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex" }}>
          {pill ? <OgPill text={pill} /> : null}
        </div>
      </div>
    </OgFrame>
  );
}
