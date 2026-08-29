import { GITHUB_URL, SITE_URL } from "@/lib/site";

const GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": `${SITE_URL}/#organization`,
      "@type": "Organization",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "developer support",
        url: `${GITHUB_URL}/issues`,
      },
      name: "BitPlan",
      sameAs: [GITHUB_URL, "https://www.npmjs.com/package/bitplan"],
      url: SITE_URL,
    },
    {
      "@id": `${SITE_URL}/#website`,
      "@type": "WebSite",
      description:
        "Publish encrypted HTML plans through a BRC-100 wallet on Bitcoin. bitplan.dev is the viewer.",
      name: "BitPlan",
      publisher: { "@id": `${SITE_URL}/#organization` },
      url: SITE_URL,
    },
    {
      "@id": `${SITE_URL}/#cli`,
      "@type": "SoftwareApplication",
      applicationCategory: "DeveloperApplication",
      downloadUrl: "https://www.npmjs.com/package/bitplan",
      name: "bitplan",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      operatingSystem: "macOS, Linux, Windows",
      url: "https://www.npmjs.com/package/bitplan",
    },
  ],
};

export function SiteJsonLd() {
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD graph
      dangerouslySetInnerHTML={{ __html: JSON.stringify(GRAPH) }}
      type="application/ld+json"
    />
  );
}
