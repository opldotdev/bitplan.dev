import { SITE_URL } from "@/lib/site";

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
      detail: "That URL is not a BitPlan resource.",
      error: "not-found",
      hint: `See ${SITE_URL}/llms.txt or ${SITE_URL}/sitemap.xml.`,
      instance,
      message: "That URL is not a BitPlan resource.",
      status: 404,
      title: "Not found",
      type: `${SITE_URL}/errors/not-found`,
    }),
    {
      headers: {
        "content-type": "application/problem+json; charset=utf-8",
      },
      status: 404,
    }
  );
}
