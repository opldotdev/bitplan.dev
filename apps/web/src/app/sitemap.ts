import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

const PUBLIC_PATHS = [
  "/",
  "/docs",
  "/docs/how-it-works",
  "/docs/cli-setup",
  "/docs/commands",
  "/docs/envelope",
  "/sponsors",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: new URL(path, SITE_URL).toString(),
  }));
}
