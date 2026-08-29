import { jsonApiOk } from "@/lib/api-error";
import { apiCliPackage } from "@/lib/openapi";

export function GET() {
  return jsonApiOk(apiCliPackage());
}
