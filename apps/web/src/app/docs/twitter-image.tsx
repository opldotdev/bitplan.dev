import { OG_SIZE, OG_TYPE, siteOgImage } from "@/lib/site-og";

export const alt = "BitPlan docs";
export const contentType = OG_TYPE;
export const size = OG_SIZE;

export default function Image() {
  return siteOgImage({
    headline: "Docs.",
    pill: "npx bitplan",
    subhead: "Encrypted plans on Bitcoin, from the CLI.",
  });
}
