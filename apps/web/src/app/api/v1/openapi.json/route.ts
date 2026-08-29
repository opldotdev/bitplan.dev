import { GET as getOpenApi } from "@/app/openapi.json/route";

export function GET() {
  return getOpenApi();
}
