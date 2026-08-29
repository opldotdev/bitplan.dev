import { GITHUB_URL, SITE_URL } from "@/lib/site";

const PAGES: Record<string, string> = {
  "/": `# BitPlan

Plan documents on Bitcoin. Encrypted by default. No servers hold your content.

Publish a self-contained HTML file with the CLI:

    npx bitplan auth
    npx bitplan upload ./plan.html

The CLI talks to a BRC-100 wallet on your machine. The wallet encrypts, signs, and publishes a 1Sat Ordinal. Upload the same file again to reinscribe the same satoshi. One origin outpoint is the draft identity.

This website is the viewer. It fetches public ciphertext from 1Sat and asks the connected wallet to decrypt. It stores no drafts.

- CLI: https://www.npmjs.com/package/bitplan
- Docs: ${SITE_URL}/docs
- Envelope: ${SITE_URL}/docs/envelope
- How it works: ${SITE_URL}/docs/how-it-works
- Source: ${GITHUB_URL}
`,
  "/about": `# About · BitPlan

BitPlan is a CLI and a viewer for encrypted HTML plan documents on Bitcoin SV. The npm package is \`bitplan\`. The website is a viewer only.

${SITE_URL}
`,
  "/contact": `# Contact · BitPlan

Source and issues: ${GITHUB_URL}

CLI: https://www.npmjs.com/package/bitplan
`,
  "/docs": `# Docs · BitPlan

The CLI packages a self-contained HTML document and asks your BRC-100 wallet to publish it as an encrypted 1Sat Ordinal.

    npx bitplan

- How it works: ${SITE_URL}/docs/how-it-works
- CLI setup: ${SITE_URL}/docs/cli-setup
- Commands: ${SITE_URL}/docs/commands
- Envelope: ${SITE_URL}/docs/envelope
`,
  "/docs/cli-setup": `# CLI setup · BitPlan

bitplan talks to a BRC-100 wallet on this machine.

    npx bitplan auth
    npx bitplan whoami
    npx bitplan upload ./plan.html

Docs: ${SITE_URL}/docs/cli-setup
`,
  "/docs/commands": `# Commands · BitPlan

CLI commands: upload, list, fetch, whoami, version, auth.

    npx bitplan upload ./plan.html
    npx bitplan list
    npx bitplan fetch <origin>

Docs: ${SITE_URL}/docs/commands
`,
  "/docs/envelope": `# Envelope · BitPlan

On-chain format for a bitplan draft: BPLN magic, JSON header, BRC-2 ciphertext. Private envelopes are v1. Shared envelopes are v2.

Docs: ${SITE_URL}/docs/envelope
`,
  "/docs/how-it-works": `# How it works · BitPlan

BitPlan publishes encrypted HTML drafts as versioned 1Sat Ordinals. Private drafts are encrypted by the wallet. For sharing, the CLI encrypts the document once and asks the wallet to wrap its key for each reader.

bitplan.dev fetches public ciphertext from 1Sat. In the browser, the connected wallet decrypts.

See ${SITE_URL}/docs/how-it-works
`,
  "/privacy": `# Privacy · BitPlan

BitPlan does not keep a drafts database or user accounts. Encrypted plan documents are inscriptions on Bitcoin. This website fetches public ciphertext from 1Sat and renders it in your browser after your wallet decrypts it.

Wallet identity keys stay in your BRC-100 wallet. Hosting logs for this website are whatever the host records for ordinary HTTP requests.

${SITE_URL}/privacy
`,
  "/sponsors": `# Sponsor BitPlan

Help keep encrypted plan documents on Bitcoin. Planned tiers include a name, logo, site link, and a mention in major release notes.

Page: ${SITE_URL}/sponsors
`,
};

export const LLMS_TXT = `# BitPlan

> Encrypted HTML plan documents on Bitcoin. The CLI publishes. This site is the viewer.

## When to use this

Use BitPlan when a user wants to publish, version, or read an encrypted HTML plan as a 1Sat Ordinal with a BRC-100 wallet.

Do not use BitPlan as a general file host, a server-side notes app, or a substitute for a BRC-100 wallet.

## CLI

- Install: \`npx bitplan\` or \`bunx bitplan\`
- Package: https://www.npmjs.com/package/bitplan
- Auth: \`npx bitplan auth\`
- Publish: \`npx bitplan upload ./plan.html\`
- List: \`npx bitplan list\`
- Fetch: \`npx bitplan fetch <origin>\`

## Site

- Home: ${SITE_URL}
- Docs: ${SITE_URL}/docs
- How it works: ${SITE_URL}/docs/how-it-works
- Envelope: ${SITE_URL}/docs/envelope
- Source: ${GITHUB_URL}

## Notes

There is no REST API. Publishing and decrypting go through the user's wallet. Drafts at /d/<origin> are ciphertext and are not indexed.
`;

export function markdownForPath(pathname: string): string | null {
  const path =
    pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;
  return PAGES[path] ?? null;
}

export function markdownNotFound(): string {
  return `# Not found

That URL is not a BitPlan page.

- Home: ${SITE_URL}
- Docs: ${SITE_URL}/docs
- Sitemap: ${SITE_URL}/sitemap.xml
- llms.txt: ${SITE_URL}/llms.txt
`;
}
