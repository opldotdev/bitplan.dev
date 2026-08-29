import {
  GET as getEnvelope,
  HEAD as headEnvelope,
} from "@/app/ordfs/content/[pointer]/route";

export function GET(
  request: Request,
  context: { params: Promise<{ pointer: string }> }
) {
  return getEnvelope(request, context);
}

export function HEAD(
  request: Request,
  context: { params: Promise<{ pointer: string }> }
) {
  return headEnvelope(request, context);
}
