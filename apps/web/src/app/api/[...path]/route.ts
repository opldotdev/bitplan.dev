import { jsonNotFound } from "@/lib/api-error";

export function GET(request: Request) {
  return jsonNotFound(new URL(request.url).pathname);
}

export function HEAD(request: Request) {
  return jsonNotFound(new URL(request.url).pathname);
}
