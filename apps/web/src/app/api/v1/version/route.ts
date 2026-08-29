import { jsonApiOk } from "@/lib/api-error";
import { apiVersionPolicy } from "@/lib/openapi";

export function GET() {
  return jsonApiOk(apiVersionPolicy());
}
