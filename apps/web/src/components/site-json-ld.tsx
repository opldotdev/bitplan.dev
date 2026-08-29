import { GITHUB_URL, SITE_URL } from "@/lib/site";

export const SITE_GRAPH = {
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
      description:
        "BitPlan publishes encrypted HTML plan documents as 1Sat Ordinals. The npm CLI is bitplan. bitplan.dev is the viewer.",
      logo: `${SITE_URL}/icon.png`,
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
      description:
        "Command-line tool that encrypts an HTML plan and publishes it as a versioned 1Sat Ordinal through a BRC-100 wallet.",
      downloadUrl: "https://www.npmjs.com/package/bitplan",
      installUrl: "https://www.npmjs.com/package/bitplan",
      name: "bitplan",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      operatingSystem: "macOS, Linux, Windows",
      sameAs: ["https://www.npmjs.com/package/bitplan", GITHUB_URL],
      url: `${SITE_URL}/docs/cli-setup`,
    },
  ],
};

export function SiteJsonLd() {
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD graph
      dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_GRAPH) }}
      type="application/ld+json"
    />
  );
}
