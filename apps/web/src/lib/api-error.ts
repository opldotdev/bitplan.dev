import { SITE_URL } from "@/lib/site";

export const API_RATE_LIMIT_HEADERS = {
  Link: `</.well-known/api-catalog>; rel="api-catalog"`,
  RateLimit: "120;w=60",
  "RateLimit-Policy": "120;w=60",
} as const;

export function jsonApiOk(body: unknown): Response {
  return Response.json(body, {
    headers: {
      ...API_RATE_LIMIT_HEADERS,
      "cache-control": "public, max-age=3600",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function jsonApiError(
  status: number,
  error: string,
  message: string,
  hint: string
): Response {
  return Response.json(
    {
      code: error,
      error,
      hint,
      message,
      status,
    },
    {
      headers: {
        ...API_RATE_LIMIT_HEADERS,
        "content-type": "application/json; charset=utf-8",
      },
      status,
    }
  );
}

export function jsonNotFound(instance: string): Response {
  return new Response(
    JSON.stringify({
      code: "not-found",
      detail: "That URL is not a BitPlan API resource.",
      error: "not-found",
      hint: `See ${SITE_URL}/openapi.json, ${SITE_URL}/llms.txt, or ${SITE_URL}/sitemap.xml.`,
      instance,
      message: "That URL is not a BitPlan API resource.",
      status: 404,
      title: "Not found",
      type: `${SITE_URL}/errors/not-found`,
    }),
    {
      headers: {
        ...API_RATE_LIMIT_HEADERS,
        "content-type": "application/problem+json; charset=utf-8",
      },
      status: 404,
    }
  );
}
