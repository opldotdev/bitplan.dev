import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      // Drafts at /d/[origin] are noindex by policy. The route also sets
      // metadata.robots and an X-Robots-Tag: noindex header.
      disallow: "/d/",
      userAgent: "*",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
