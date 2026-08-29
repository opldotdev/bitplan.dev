import { OG_SIZE, OG_TYPE, siteOgImage } from "@/lib/site-og";

export const alt = "Sponsor BitPlan";
export const contentType = OG_TYPE;
export const size = OG_SIZE;

export default function Image() {
  return siteOgImage({
    headline: "Sponsor BitPlan.",
    subhead: "Help keep encrypted plan documents on Bitcoin.",
  });
}
