import { LLMS_TXT } from "@/lib/agent-pages";

export function GET() {
  return new Response(LLMS_TXT, {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": "text/markdown; charset=utf-8",
    },
  });
}
