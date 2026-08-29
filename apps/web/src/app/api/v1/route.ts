import { API_RATE_LIMIT_HEADERS } from "@/lib/api-error";
import { apiIndex } from "@/lib/openapi";

export function GET() {
  return Response.json(apiIndex(), {
    headers: {
      ...API_RATE_LIMIT_HEADERS,
      "cache-control": "public, max-age=3600",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
