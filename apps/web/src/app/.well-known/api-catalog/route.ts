import { SITE_URL } from "@/lib/site";

const CATALOG = {
  linkset: [
    {
      anchor: SITE_URL,
      "service-desc": [
        {
          href: `${SITE_URL}/openapi.json`,
          type: "application/openapi+json",
        },
      ],
    },
  ],
};

export function GET() {
  return Response.json(CATALOG, {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": "application/linkset+json; charset=utf-8",
    },
  });
}
