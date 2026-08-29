import { jsonApiOk } from "@/lib/api-error";
import { apiIndex } from "@/lib/openapi";

export function GET() {
  return jsonApiOk(apiIndex());
}
