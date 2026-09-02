import type { MetadataRoute } from "next";

import { COMPETITORS } from "@/lib/competitors";
import { SITE_URL } from "@/lib/site";

const PUBLIC_PATHS = [
  "/",
  "/docs",
  "/docs/how-it-works",
  "/docs/cli-setup",
  "/docs/agents",
  "/docs/commands",
  "/docs/envelope",
  "/sponsors",
  "/compare",
  ...COMPETITORS.map((competitor) => `/compare/${competitor.slug}`),
  "/about",
  "/privacy",
  "/contact",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: new URL(path, SITE_URL).toString(),
  }));
}
