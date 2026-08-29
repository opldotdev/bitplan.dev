import { OPENAPI_SPEC } from "@/lib/openapi";

export function GET() {
  return Response.json(OPENAPI_SPEC, {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
