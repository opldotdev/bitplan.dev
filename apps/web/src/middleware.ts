import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { markdownForPath, markdownNotFound } from "@/lib/agent-pages";

export function middleware(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  const path = request.nextUrl.pathname;

  if (shouldSkip(path)) {
    return NextResponse.next();
  }

  if (prefers(accept, "text/markdown", "text/html")) {
    const markdown = markdownForPath(path);
    if (markdown) {
      return markdownResponse(markdown, 200);
    }
    return markdownResponse(markdownNotFound(), 404);
  }

  const response = NextResponse.next();
  response.headers.append("vary", "Accept");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

function shouldSkip(path: string): boolean {
  return (
    path.startsWith("/ordfs") ||
    path.startsWith("/d/") ||
    path.includes("opengraph-image") ||
    path.includes("twitter-image")
  );
}

function prefers(accept: string, type: string, over: string): boolean {
  const wanted = quality(accept, type);
  if (wanted === null) {
    return false;
  }
  const other = quality(accept, over);
  return other === null || wanted > other;
}

function quality(accept: string, type: string): number | null {
  const lower = accept.toLowerCase();
  if (lower.includes("*/*") && !lower.includes(type)) {
    return null;
  }
  const parts = accept.split(",").map((part) => part.trim());
  for (const part of parts) {
    const [media, ...params] = part.split(";").map((item) => item.trim());
    if (media.toLowerCase() !== type) {
      continue;
    }
    const q = params.find((param) => param.startsWith("q="));
    return q ? Number(q.slice(2)) : 1;
  }
  return lower.includes(type) ? 1 : null;
}

function markdownResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept",
    },
    status,
  });
}
