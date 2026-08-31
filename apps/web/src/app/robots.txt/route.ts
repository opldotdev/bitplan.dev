import { SITE_URL } from "@/lib/site";

const ROBOTS_TXT = `User-Agent: *
Allow: /
Disallow: /d/
Content-Signal: ai-train=no, search=yes, ai-input=yes

Sitemap: ${SITE_URL}/sitemap.xml
Agentmap: ${SITE_URL}/.well-known/ai-catalog.json
`;

export function GET() {
  return new Response(ROBOTS_TXT, {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
