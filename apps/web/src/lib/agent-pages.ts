import { GITHUB_URL, SITE_URL } from "@/lib/site";

const PAGES: Record<string, string> = {
  "/": `# BitPlan

Secure agent plans. Encrypted before upload. Keep a draft hosted while it changes, then put it on Bitcoin when it should be permanent.

Publish a self-contained HTML file with the CLI:

    npx bitplan auth
    bunx bitplan upload ./plan.html --hosted --link

BRC-100 is the interface the CLI uses to talk to a wallet. It is not an inscription format. Hosted drafts store only sealed envelopes on bitplan.dev and cost no BSV. A finished plan can be published as a 1Sat Ordinal inscription.

This website stores ciphertext for hosted drafts and fetches on-chain ciphertext from 1Sat. Decryption happens in the browser with an authorized wallet or reader link. The server never receives plaintext.

- CLI: https://www.npmjs.com/package/bitplan
- Docs: ${SITE_URL}/docs
- Envelope: ${SITE_URL}/docs/envelope
- How it works: ${SITE_URL}/docs/how-it-works
- Source: ${GITHUB_URL}
`,
  "/about": `# About · BitPlan

BitPlan is a CLI and viewer for encrypted HTML plans. A plan can stay hosted as ciphertext while it changes, then move to Bitcoin as a 1Sat Ordinal. The npm package is \`bitplan\`.

${SITE_URL}
`,
  "/contact": `# Contact · BitPlan

Source and issues: ${GITHUB_URL}

CLI: https://www.npmjs.com/package/bitplan
`,
  "/docs": `# Docs · BitPlan

The CLI packages a self-contained HTML document and uses the BRC-100 interface to ask your wallet to encrypt it. Keep the ciphertext hosted while the plan changes, or publish it as a 1Sat Ordinal.

After a hosted upload, the CLI tries to sync an encrypted catalog. The sync is best effort and never fails the upload. Connecting the same BRC-100 wallet identity on /drafts lets the browser locate and decrypt that catalog to list your own hosted plans on another device. BitPlan keeps only ciphertext and a hash used to check later writes.

    npx bitplan

- How it works: ${SITE_URL}/docs/how-it-works
- CLI setup: ${SITE_URL}/docs/cli-setup
- Agents and wallets: ${SITE_URL}/docs/agents
- Commands: ${SITE_URL}/docs/commands
- Envelope: ${SITE_URL}/docs/envelope
`,
  "/docs/agents": `# Agents and wallets · BitPlan

A coding agent uses the BitPlan CLI. The CLI calls a BRC-100 wallet on the same computer. The wallet keeps the keys and decides which operations are allowed.

    npx bitplan list --json
    npx bitplan fetch <origin> --json
    npx bitplan upload ./plan.html --yes --json

Never give an agent a wallet mnemonic or private key. To read new plans with another wallet, save its public identity as a default reader:

    npx bitplan config --share-with <wallet-identity-key>

For a local team, save contacts and share by team name:

    npx bitplan contact set alice <identity-key>
    npx bitplan team add acme-dev alice
    npx bitplan config --share-with acme-dev

Contact names, their public keys, and team membership are defined in ~/.bitplan/config.json. A local draft may remember a name so it can resolve the current members when publishing. Neither names nor membership go to BitPlan servers or on-chain; only public identity keys appear in the shared envelope. BitPlan has no accounts or membership database. Hosted storage contains sealed envelopes, not names, wallet keys, or plaintext. Removing a member excludes them from the next version of locally tracked plans that remember the team, but cannot revoke older versions.

Docs: ${SITE_URL}/docs/agents
`,
  "/docs/cli-setup": `# CLI setup · BitPlan

bitplan talks to a BRC-100 wallet on this machine.

    npx bitplan auth
    npx bitplan whoami
    npx bitplan upload ./plan.html

Docs: ${SITE_URL}/docs/cli-setup
`,
  "/docs/commands": `# Commands · BitPlan

CLI commands: upload, list, fetch, config, contact, team, whoami, version, auth, catalog sync.

    bunx bitplan upload ./plan.html --hosted --link
    bunx bitplan inscribe ./plan.html
    bunx bitplan catalog sync
    npx bitplan list
    npx bitplan fetch <origin>
    npx bitplan contact set <name> <identity-key>
    npx bitplan contact remove <name>
    npx bitplan contact list
    npx bitplan team set <name> <contacts...>
    npx bitplan team add <name> <contacts...>
    npx bitplan team remove <name> <contacts...>
    npx bitplan team delete <name>
    npx bitplan team list

Run \`bunx bitplan catalog sync\` when the automatic sync was skipped or failed; it retries the catalog sync and merges locally tracked drafts. A second device with the same BRC-100 wallet identity can list and read those hosted plans, but it cannot update them.

Docs: ${SITE_URL}/docs/commands
`,
  "/docs/envelope": `# Envelopes · BitPlan

The envelope is BitPlan's sealed container: BPLN framing, a public JSON header, and an encrypted body. The same format works in hosted storage and on chain. It is not the encryption key.

Docs: ${SITE_URL}/docs/envelope
`,
  "/docs/how-it-works": `# How it works · BitPlan

BitPlan encrypts HTML plans before upload. BRC-100 is the interface BitPlan uses to talk to the wallet; it is not an inscription format. The same sealed envelope can stay hosted while it changes or become a versioned 1Sat Ordinal.

bitplan.dev stores ciphertext for hosted drafts and fetches on-chain ciphertext from 1Sat. An authorized wallet or reader link decrypts in the browser. The server never receives plaintext.

Private plans use BRC-100 wallet encryption with [2, "bitplan"], a public keyID, and counterparty self. Shared plans use a fresh random 32-byte document key and @bsv/sdk AES-256-GCM, then wallet-encrypt that key once per reader. The authenticated payload commits the exact public header. Wallet private keys never leave the wallet. Shared reader identity keys are public.

See ${SITE_URL}/docs/how-it-works
`,
  "/new": `# New plan · BitPlan

Create and review a private BitPlan in the browser at ${SITE_URL}/new.

Browser agents with WebMCP can call \`start_bitplan_plan\` to open the composer, then \`prepare_bitplan_plan\` with a title, plan body, and optional HTTPS repository URL. The tool validates and stages the exact review preview. It never connects a wallet or publishes; the user must approve publishing through their BRC-100 wallet.

On any page, \`list_my_bitplans\` can list plan IDs and viewer links from a wallet the user already connected to that tab. \`open_bitplan\` opens one in the visible viewer. Neither tool returns decrypted plan text to the agent.
`,
  "/privacy": `# Privacy · BitPlan

BitPlan has no user accounts. Hosted drafts are sealed envelopes stored as ciphertext. On-chain plans are 1Sat Ordinal inscriptions. The website never receives plaintext; your wallet or reader link decrypts in the browser.

Wallet identity keys stay in your BRC-100 wallet. Hosting logs for this website are whatever the host records for ordinary HTTP requests.

${SITE_URL}/privacy
`,
  "/sponsors": `# Sponsor BitPlan

Choose one of 30 fixed placements, crop a WebP, and pay with Yours Wallet or another BRC-100 wallet. The image, backlink, placement, and payment are published together on Bitcoin. The first valid transaction received for a slot wins.

Page: ${SITE_URL}/sponsors
`,
};

export const LLMS_TXT = `# BitPlan

> Encrypted HTML plans. Host ciphertext while a draft changes, then put it on Bitcoin when it should be permanent.

## When to use this

Use BitPlan when a user wants to draft, publish, version, share, or read an encrypted HTML plan using a BRC-100 wallet.

Do not use BitPlan as a general file host, a server-side notes app, or a substitute for a BRC-100 wallet.

## Terms

- BRC-100 is the interface BitPlan uses to talk to a wallet. It is not an inscription format.
- A hosted BitPlan is a sealed envelope stored by bitplan.dev. The server cannot decrypt it.
- An on-chain BitPlan is a 1Sat Ordinal inscription. Later versions reinscribe the same satoshi.
- A reader link is a bearer credential. Anyone with the complete link can read.

## CLI

- Install: \`npx bitplan\` or \`bunx bitplan\`
- Package: https://www.npmjs.com/package/bitplan
- Auth: \`npx bitplan auth\`
- Hosted draft: \`bunx bitplan upload ./plan.html --hosted --link\`
- Publish on chain: \`bunx bitplan upload ./plan.html\`
- Move a hosted draft on chain: \`bunx bitplan inscribe ./plan.html\`
- List: \`npx bitplan list\`
- Fetch: \`npx bitplan fetch <origin>\`
- Share: \`npx bitplan upload ./plan.html --share-with <identity-key-or-contact>\`
- Reader link, no wallet needed to read: \`npx bitplan upload ./plan.html --link\`
- Catalog sync: \`bunx bitplan catalog sync\`
- Agent skill: \`npx skills add opldotdev/bitplan.dev --skill bitplan -g\`

After a hosted upload, the CLI tries to sync an encrypted catalog; the sync is best effort and never fails the upload. Connecting the same BRC-100 wallet identity on /drafts lists your own hosted plans on another device; that device can read but cannot update them.

## Site

- Home: ${SITE_URL}
- Docs: ${SITE_URL}/docs
- How it works: ${SITE_URL}/docs/how-it-works
- Envelope: ${SITE_URL}/docs/envelope
- CLI setup: ${SITE_URL}/docs/cli-setup
- Agents and wallets: ${SITE_URL}/docs/agents
- Source: ${GITHUB_URL}

## HTTP

Read an encrypted envelope:

    GET ${SITE_URL}/ordfs/content/<origin>:-1

For an on-chain origin, this returns public ciphertext from 1Sat. For a hosted ID, it returns hosted ciphertext. The CLI is the npm package bitplan: https://www.npmjs.com/package/bitplan

Creating and updating a plan goes through the user's wallet via \`npx bitplan\`. Decryption happens in the browser or CLI. Drafts at /d/<origin> are ciphertext and are not indexed.
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

Look next:

- Home: ${SITE_URL}
- Docs: ${SITE_URL}/docs
- Sitemap: ${SITE_URL}/sitemap.xml
- llms.txt: ${SITE_URL}/llms.txt
`;
}
