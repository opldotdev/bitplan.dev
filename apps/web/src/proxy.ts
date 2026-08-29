import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isDocumentPath,
  prefers,
  wantsMarkdownNotFound,
} from "@/lib/agent-accept";
import { markdownForPath, markdownNotFound } from "@/lib/agent-pages";

export function proxy(request: NextRequest) {
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

  if (
    isDocumentPath(path) &&
    markdownForPath(path) === null &&
    wantsMarkdownNotFound(accept)
  ) {
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

function markdownResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept, Accept-Encoding",
    },
    status,
  });
}
