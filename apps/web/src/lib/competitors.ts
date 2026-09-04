/**
 * Single source of truth for the /compare pages. Update a competitor here and
 * every page that mentions it changes. Facts were checked on the date in
 * `checked`; anything we could not verify is phrased as such in the copy.
 */

export interface ComparisonRow {
  /** BitPlan's answer. */
  bitplan: string;
  /** Row label shown in the first column. */
  label: string;
  /** The competitor's answer. */
  them: string;
}

export interface Competitor {
  /** Honest limits of BitPlan against this specific product. */
  bitplanLimits: string[];
  checked: string;
  chooseBitplan: string[];
  chooseThem: string[];
  name: string;
  /** One sentence for the hub list and meta description. */
  oneLine: string;
  rows: ComparisonRow[];
  /** Short phrase for headings and the hub table. */
  short: string;
  slug: string;
  /** Ideas worth stealing, kept private to the data file for now. */
  sources: { label: string; url: string }[];
  /** Two or three sentences for scanners. */
  tldr: string;
  url: string;
  /** Who runs it and what it is, in plain language. */
  what: string;
}

export const BITPLAN_PROFILE = {
  name: "BitPlan",
  strengths: [
    "The wallet encrypts every plan before it leaves your machine. There is no cleartext mode.",
    "Hosted drafts cost no BSV and store only ciphertext. A finished plan can move on chain for permanence.",
    "A reader can use a wallet identity or a private reader link. The server never receives the plaintext.",
    "Hosted and on-chain updates reject version conflicts instead of silently overwriting another writer.",
    "The CLI returns structured JSON, publishes an llms.txt, and exposes WebMCP tools for agents.",
  ],
  weaknesses: [
    "Creating or updating a plan still needs a BRC-100 wallet. Only the on-chain path needs BSV.",
    "One self-contained HTML file per plan, 5 MB maximum, no folders yet.",
    "The viewer runs plan scripts in a sandbox with no network access. A plan cannot phone home.",
    "A reader link is a bearer credential. Anyone who gets the complete link can read that version.",
    "Hosted drafts depend on bitplan.dev until they are inscribed. On-chain versions cannot be deleted.",
    "No custom domains, no analytics, no hosted forms.",
  ],
} as const;

export const COMPETITORS: Competitor[] = [
  {
    bitplanLimits: [
      "here.now serves folders and scripts. BitPlan serves one sandboxed HTML file.",
      "here.now needs no wallet. BitPlan needs a BRC-100 wallet to create or update a plan.",
      "here.now has passwords and email gates. BitPlan has wallet identities and bearer reader links.",
    ],
    checked: "2026-09-04",
    chooseBitplan: [
      "The document is a plan, spec, or report that the hosting provider should never be able to read.",
      "You want to review a hosted draft first, then make the finished plan permanent on chain.",
      "Your readers have wallet identities, or a private reader link is the right tradeoff.",
    ],
    chooseThem: [
      "You are publishing a real site, a demo, or a multi-file artifact.",
      "You want scripts, custom domains, analytics, or team workspaces.",
      "You are fine with a company holding the bytes and a link being the secret.",
    ],
    name: "here.now",
    oneLine:
      "General static hosting for agents. Better for websites; BitPlan is built for encrypted plans.",
    rows: [
      {
        bitplan:
          "Hosted ciphertext on bitplan.dev while drafting; ciphertext on Bitcoin after inscription.",
        label: "Who holds the content",
        them: "here.now's servers on Cloudflare.",
      },
      {
        bitplan: "Encrypted before upload. No cleartext mode.",
        label: "Default privacy",
        them: "Public. Anyone with the unguessable link can read it.",
      },
      {
        bitplan:
          "Wallet identity keys or a reader link. Decryption happens in the browser.",
        label: "Access control",
        them: "Link, password, email, domain, or workspace access. Enforced by their server.",
      },
      {
        bitplan:
          "A fresh 32-byte document key, wrapped separately for each authorized reader.",
        label: "Encryption",
        them: "Not stated in their docs or privacy policy.",
      },
      {
        bitplan:
          "Hosted versions share one random ID. On-chain versions share one permanent origin.",
        label: "Versioning",
        them: "Recorded on Free. Browse and restore from $4/month.",
      },
      {
        bitplan: "A stale hosted or on-chain update fails with a conflict.",
        label: "Concurrent edits",
        them: "Optional baseVersionId returns 409 on conflict.",
      },
      {
        bitplan:
          "Hosted ciphertext can be removed with an authenticated request. On-chain versions cannot.",
        label: "Deletion",
        them: "Owner can hard-delete. Anonymous sites expire in 24 hours.",
      },
      {
        bitplan: "Only ciphertext exists to index.",
        label: "Search engines",
        them: "Public sites may be indexed. Gated sites return noindex.",
      },
      {
        bitplan: "One HTML file, 5 MB, scripts run with no network access.",
        label: "Content",
        them: "Static files, folders, and SPA routing, up to 5 GB per file on account plans.",
      },
      {
        bitplan: "No account. A BRC-100 wallet creates and updates plans.",
        label: "Account",
        them: "None for 24-hour links. Email or Google for anything permanent.",
      },
      {
        bitplan:
          "Hosted drafts cost no BSV. On-chain publishing pays the Bitcoin network fee.",
        label: "Price",
        them: "Free with 10 GB and 500 sites. Hobby $4/month. Developer $20/month.",
      },
      {
        bitplan: "CLI with JSON output, llms.txt, WebMCP tools in the viewer.",
        label: "Agent integration",
        them: "REST API, installable skill, agent discovery files.",
      },
    ],
    short: "here.now",
    slug: "here-now",
    sources: [
      { label: "here.now docs", url: "https://here.now/docs" },
      { label: "here.now pricing", url: "https://here.now/pricing.md" },
      { label: "here.now privacy policy", url: "https://here.now/privacy" },
      { label: "here.now terms", url: "https://here.now/terms" },
    ],
    tldr: "here.now is the better general host: folders, scripts, custom domains, analytics, and workspaces. BitPlan is the better encrypted plan system: the wallet seals the document before upload, the host never gets plaintext, and a finished plan can move on chain. Choose here.now for a website. Choose BitPlan for a plan the host should not be able to read.",
    url: "https://here.now",
    what: "here.now is a hosting service built for coding agents. An agent calls its API or installed skill, uploads a file or folder, and gets a live URL on Cloudflare's edge in seconds. Anonymous uploads live for 24 hours. An account makes them permanent and unlocks custom domains, analytics, and version history.",
  },
  {
    bitplanLimits: [
      "postplan needs nothing installed beyond Node. BitPlan needs a BRC-100 wallet.",
      "postplan is simpler to discard. On-chain BitPlan versions cannot be deleted.",
    ],
    checked: "2026-09-02",
    chooseBitplan: [
      "The plan holds anything you would not want a crawler or a leaked link to expose.",
      "You need the record to outlive a side project's server.",
      "You want named readers rather than link holders.",
    ],
    chooseThem: [
      "You want a draft link in one command with no wallet and no setup.",
      "The plan is not sensitive, or a random URL is enough.",
      "You want to self-host a tiny service you fully understand.",
    ],
    name: "postplan",
    oneLine:
      "The open-source draft host BitPlan was modelled on. Same CLI shape, public drafts, no encryption.",
    rows: [
      {
        bitplan:
          "Hosted ciphertext on bitplan.dev while drafting; ciphertext on Bitcoin after inscription.",
        label: "Who holds the content",
        them: "A Railway-hosted server with S3 storage. Self-hosting is supported.",
      },
      {
        bitplan: "Encrypted before upload. No cleartext mode.",
        label: "Default privacy",
        them: "Public. The random draft ID is the only secret.",
      },
      {
        bitplan: "Wallet identity keys named at publish time.",
        label: "Access control",
        them: "None. Any client that has the URL gets the exact bytes.",
      },
      {
        bitplan:
          "Keep hosted versions at one ID, or reinscribe the same satoshi on chain.",
        label: "Versioning",
        them: "Re-upload the same path. One URL, numbered versions, --new to fork.",
      },
      {
        bitplan:
          "Hosted ciphertext can be removed with an authenticated request. On-chain versions are permanent.",
        label: "Deletion and retention",
        them: "Not documented.",
      },
      {
        bitplan: "Only ciphertext exists to index.",
        label: "Search engines",
        them: "No noindex or robots rules documented.",
      },
      {
        bitplan:
          "External scripts rejected at upload; inline scripts run with no network.",
        label: "Scripts",
        them: "Rejected at upload, blocked with script-src 'none'.",
      },
      {
        bitplan: "5 MB.",
        label: "Size limit",
        them: "512 KB.",
      },
      {
        bitplan: "No account. A BRC-100 wallet creates and updates plans.",
        label: "Account",
        them: "Optional. Anonymous uploads work, sign-in adds attribution and listing.",
      },
      {
        bitplan:
          "Hosted drafts cost no BSV. On-chain publishing pays the Bitcoin network fee.",
        label: "Price",
        them: "Free. No pricing page. Run by one person.",
      },
      {
        bitplan: "MIT.",
        label: "License",
        them: "MIT.",
      },
    ],
    short: "postplan",
    slug: "postplan",
    sources: [
      {
        label: "postplan on npm",
        url: "https://www.npmjs.com/package/postplan",
      },
      { label: "postplan.dev", url: "https://postplan.dev" },
    ],
    tldr: "postplan and BitPlan have the same job and a similar command shape. postplan stores cleartext and relies on an unguessable draft ID. BitPlan stores ciphertext, using wallet identities or a reader link for access, and can later put the plan on chain. Choose postplan for zero setup. Choose BitPlan when the host should not be able to read the plan.",
    url: "https://postplan.dev",
    what: "postplan is a small MIT-licensed service and CLI by Theo Browne. An agent runs npx postplan upload on an HTML file and gets a draft URL. Re-uploading the same file creates a new version at the same URL. It runs on Railway with Postgres and S3-compatible storage, and it is self-hostable.",
  },
  {
    bitplanLimits: [
      "Claude artifacts can run scripts and call a model. BitPlan plans are static.",
      "Claude publishes from the chat with one click. BitPlan needs a wallet and a CLI.",
    ],
    checked: "2026-09-02",
    chooseBitplan: [
      "The artifact is a plan or spec with names, numbers, or roadmaps in it.",
      "You want a record that does not depend on a vendor's publish setting.",
      "Your coding agent runs in a terminal, not a chat window.",
    ],
    chooseThem: [
      "You built something interactive in a chat and want to share it now.",
      "Public is fine, or your whole audience is inside one Claude organization.",
      "You want scripts, AI features, and persistent storage in the page.",
    ],
    name: "Claude Artifacts",
    oneLine:
      "Publish straight from a chat. Public on consumer plans, org-only on Team and Enterprise, hosted by Anthropic.",
    rows: [
      {
        bitplan:
          "Hosted ciphertext on bitplan.dev while drafting; ciphertext on Bitcoin after inscription.",
        label: "Who holds the content",
        them: "Anthropic.",
      },
      {
        bitplan: "Encrypted before upload. No cleartext mode.",
        label: "Default privacy",
        them: "Publishing is public on Free, Pro, and Max. Org-only on Team and Enterprise.",
      },
      {
        bitplan: "Wallet identity keys named at publish time.",
        label: "Access control",
        them: "Public link, or organization login. No per-reader invites.",
      },
      {
        bitplan:
          "Hosted versions share one ID. On-chain versions share one permanent origin.",
        label: "Versioning",
        them: "You publish one chosen version. Iterations live in the chat.",
      },
      {
        bitplan:
          "Hosted ciphertext can be removed with an authenticated request. On-chain versions cannot.",
        label: "Revocation",
        them: "Unpublish removes the link for good. Storage data is deleted with it.",
      },
      {
        bitplan: "Only ciphertext exists to index.",
        label: "Search engines",
        them: "noindex added July 2026 after public artifacts were indexed.",
      },
      {
        bitplan: "Inline scripts run in a sandbox with no network access.",
        label: "Scripts",
        them: "Allowed. Artifacts can call Claude and keep 20 MB of state on paid plans.",
      },
      {
        bitplan: "Fetch, edit, upload as a new draft.",
        label: "Fork or remix",
        them: "Copy the code into a new chat. The Remix button was removed.",
      },
      {
        bitplan: "No account. A BRC-100 wallet creates and updates plans.",
        label: "Account",
        them: "Claude account to publish. None to view public artifacts.",
      },
      {
        bitplan:
          "Hosted drafts cost no BSV. On-chain publishing pays the Bitcoin network fee.",
        label: "Price",
        them: "Included in the Claude plan.",
      },
    ],
    short: "Claude Artifacts",
    slug: "claude-artifacts",
    sources: [
      {
        label: "Publish and share artifacts",
        url: "https://support.claude.com/en/articles/9547008-publish-and-share-artifacts",
      },
      {
        label: "Axios, July 2026: Google indexing public Claude artifacts",
        url: "https://www.axios.com/2026/07/27/anthropic-claude-public-chats-google-search",
      },
    ],
    tldr: "Claude Artifacts are the fastest path from a conversation to a link, and interactive artifacts can run scripts and even call Claude. The content lives with Anthropic and, on consumer plans, publishing means public. In July 2026 published artifacts were found in Google results because the pages lacked a noindex tag. BitPlan is for the plan you would rather not put in that position.",
    url: "https://support.claude.com/en/articles/9547008-publish-and-share-artifacts",
    what: "Claude can publish an artifact it built to a public link on Free, Pro, and Max plans. Team and Enterprise plans share artifacts inside the organization only. Anthropic hosts the page. Unpublishing revokes the link permanently, and that artifact can never be republished.",
  },
  {
    bitplanLimits: [
      "Sites hosts full apps with a backend. BitPlan hosts one static file.",
      "Sites has editors and analytics. BitPlan has readers.",
    ],
    checked: "2026-09-02",
    chooseBitplan: [
      "You want a plan file under your own keys, not a platform under a licence.",
      "You are in a region where Sites is unavailable.",
      "You want the artifact to survive plan changes and account changes.",
    ],
    chooseThem: [
      "You want an application, not a document.",
      "You need editors, a database, custom domains, and analytics.",
      "Your team already lives in a ChatGPT workspace.",
    ],
    name: "ChatGPT Sites",
    oneLine:
      "Full app hosting from a ChatGPT conversation. Private by default, hosted by OpenAI, paid plans only.",
    rows: [
      {
        bitplan:
          "Hosted ciphertext on bitplan.dev while drafting; ciphertext on Bitcoin after inscription.",
        label: "Who holds the content",
        them: "OpenAI-managed hosting.",
      },
      {
        bitplan: "Encrypted before upload. No cleartext mode.",
        label: "Default privacy",
        them: "Private to owner and admins. Public publishing is a setting, off by default in Enterprise.",
      },
      {
        bitplan: "Wallet identity keys named at publish time.",
        label: "Access control",
        them: "Selected users, groups, workspace, or anyone. Enforced by OpenAI.",
      },
      {
        bitplan:
          "Hosted versions share one ID. On-chain versions share one permanent origin.",
        label: "Versioning",
        them: "Saved versions and deployed versions, tied to git commits. Redeploy earlier ones.",
      },
      {
        bitplan:
          "Hosted ciphertext can be removed with an authenticated request. On-chain versions cannot.",
        label: "Deletion",
        them: "Restrict access, or permanently delete the site.",
      },
      {
        bitplan:
          "No account. The service stores hosted ciphertext, never plaintext.",
        label: "Content licence",
        them: "You own it. OpenAI gets an irrevocable licence to host it, and you are the data controller.",
      },
      {
        bitplan: "Static HTML with sandboxed scripts, no backend.",
        label: "Scripts and backend",
        them: "Full apps: database, storage, WebSockets, custom domains.",
      },
      {
        bitplan: "Invite readers by identity key.",
        label: "Collaboration",
        them: "Promote visitors to editors inside a workspace.",
      },
      {
        bitplan: "Anywhere with a wallet.",
        label: "Availability",
        them: "Not in the EEA, Switzerland, or UK at launch.",
      },
      {
        bitplan:
          "Hosted drafts cost no BSV. On-chain publishing pays the Bitcoin network fee.",
        label: "Price",
        them: "Plus, Pro, Business, Enterprise, or Edu plan. Not on Free.",
      },
    ],
    short: "ChatGPT Sites",
    slug: "chatgpt-sites",
    sources: [
      {
        label: "ChatGPT Sites docs",
        url: "https://learn.chatgpt.com/docs/sites",
      },
      {
        label: "ChatGPT Sites terms",
        url: "https://openai.com/policies/chatgpt-sites-terms/",
      },
    ],
    tldr: "ChatGPT Sites is a hosting platform, not a draft link. It is private by default and has real version history, but the content sits with OpenAI under an irrevocable hosting licence, it needs a Plus plan or higher, and it is not available in the EU or UK. BitPlan is a much smaller tool that keeps the plan encrypted under your own keys.",
    url: "https://learn.chatgpt.com/docs/sites",
    what: "ChatGPT Sites replaced Canvas sharing in mid 2026. You describe a site in chat and ChatGPT deploys it to a chatgpt.site URL or a custom domain, with a database, object storage, analytics, and multi-editor collaboration. A new site is visible only to its owner and workspace admins until you widen access.",
  },
];

export function findCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((competitor) => competitor.slug === slug);
}

/** Rows that appear in the hub table, keyed by label present on every competitor. */
export const HUB_ROW_LABELS = [
  "Who holds the content",
  "Default privacy",
  "Access control",
  "Versioning",
  "Search engines",
  "Price",
] as const;
