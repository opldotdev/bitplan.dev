import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      // Drafts at /d/[origin] are noindex by policy. The route also sets
      // metadata.robots and an X-Robots-Tag: noindex header.
      disallow: "/d/",
      userAgent: "*",
    },
  };
}
