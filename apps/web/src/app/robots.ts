import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      // Drafts at /d/[origin] are noindex by policy. The viewer route is not
      // built in this wave; keep /d/ disallowed so it stays out of indexes
      // when /d/[origin] ships.
      disallow: "/d/",
      userAgent: "*",
    },
  };
}
