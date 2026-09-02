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
    "No account, no drafts database, no content server. The site can be offline and the plan still exists.",
    "Every version stays readable at one permanent origin. A concurrent publish fails instead of silently overwriting.",
    "Readers are wallet identity keys, so an invite is a key, not an email and a password.",
    "The CLI returns structured JSON, publishes an llms.txt, and exposes WebMCP tools for agents.",
  ],
  weaknesses: [
    "You need a BRC-100 wallet on your machine with a small amount of BSV. Publishing a 500 KB plan costs under a cent, but it is not free.",
    "One self-contained HTML file per plan, 5 MB maximum, no folders yet.",
    "The viewer runs plan scripts in a sandbox with no network access. A plan cannot phone home.",
    "Readers need a wallet too. There is no password link or email invite yet.",
    "Nothing can be deleted or expired. Ciphertext is on a public chain forever.",
    "No custom domains, no analytics, no hosted forms.",
  ],
} as const;

export const COMPETITORS: Competitor[] = [
  {
    bitplanLimits: [
      "here.now serves folders and scripts. BitPlan serves one sandboxed HTML file.",
      "here.now has a free tier with no wallet. BitPlan needs a wallet and a few satoshis.",
      "here.now can gate a page with a password. BitPlan readers need a wallet identity key.",
    ],
    checked: "2026-09-02",
    chooseBitplan: [
      "The document is a plan, a spec, or a report that should not be readable by a link holder.",
      "You want a permanent, versioned record that no host can delete or lose.",
      "Your readers already have wallet identities, or you are the only reader.",
    ],
    chooseThem: [
      "You are publishing a real site, a demo, or a multi-file artifact.",
      "You want scripts, custom domains, analytics, or team workspaces.",
      "You are fine with a company holding the bytes and a link being the secret.",
    ],
    name: "here.now",
    oneLine:
      "Instant static hosting for coding agents. Public by default, gated on paid plans, hosted by a company.",
    rows: [
      {
        bitplan: "Bitcoin SV. The site stores nothing.",
        label: "Who holds the content",
        them: "here.now's servers on Cloudflare.",
      },
      {
        bitplan: "Encrypted before upload. No cleartext mode.",
        label: "Default privacy",
        them: "Public. Anyone with the unguessable link can read it.",
      },
      {
        bitplan: "Wallet identity keys named at publish time.",
        label: "Access control",
        them: "Password or email allowlist, on claimed sites. Enforced by their server.",
      },
      {
        bitplan: "AES-256-GCM with a per-plan key, wrapped by the wallet.",
        label: "Encryption",
        them: "Not stated in their docs or privacy policy.",
      },
      {
        bitplan: "Every version stays on chain at one origin.",
        label: "Versioning",
        them: "Recorded on Free. Browse and restore from $4/month.",
      },
      {
        bitplan: "Second publish fails. The coin is already spent.",
        label: "Concurrent edits",
        them: "Optional baseVersionId returns 409 on conflict.",
      },
      {
        bitplan: "Impossible.",
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
        them: "Any static files, folders, SPA routing, up to 5 GB per site.",
      },
      {
        bitplan: "None. A BRC-100 wallet.",
        label: "Account",
        them: "None for 24-hour links. Email or Google for anything permanent.",
      },
      {
        bitplan: "Network fee per publish, about 1 satoshi per KB.",
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
    tldr: "here.now is the better host: folders, scripts, custom domains, analytics, workspaces, and a free tier with 10 GB. BitPlan is the better vault: the plan is encrypted by your wallet before upload, readers are identity keys, and no company holds the content. Choose here.now for anything you would put on a website. Choose BitPlan for a plan you would not paste into a public link.",
    url: "https://here.now",
    what: "here.now is a hosting service built for coding agents. An agent calls its API or installed skill, uploads a file or folder, and gets a live URL on Cloudflare's edge in seconds. Anonymous uploads live for 24 hours. An account makes them permanent and unlocks custom domains, analytics, and version history.",
  },
  {
    bitplanLimits: [
      "postplan needs nothing installed beyond Node. BitPlan needs a wallet with satoshis.",
      "postplan drafts can be forgotten. BitPlan drafts cannot be deleted.",
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
        bitplan: "Bitcoin SV. The site stores nothing.",
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
          "Reinscribe the same satoshi. One origin, every version on chain.",
        label: "Versioning",
        them: "Re-upload the same path. One URL, numbered versions, --new to fork.",
      },
      {
        bitplan: "Impossible. Permanent by design.",
        label: "Deletion and retention",
        them: "Not documented.",
      },
      {
        bitplan: "Only ciphertext exists to index.",
        label: "Search engines",
        them: "No noindex or robots rules documented.",
      },
      {
        bitplan: "External scripts rejected at upload; inline scripts run with no network.",
        label: "Scripts",
        them: "Rejected at upload, blocked with script-src 'none'.",
      },
      {
        bitplan: "5 MB.",
        label: "Size limit",
        them: "512 KB.",
      },
      {
        bitplan: "None. A BRC-100 wallet.",
        label: "Account",
        them: "Optional. Anonymous uploads work, sign-in adds attribution and listing.",
      },
      {
        bitplan: "Network fee per publish, about 1 satoshi per KB.",
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
    tldr: "postplan and BitPlan have the same job and the same command shape. postplan stores cleartext on a server and relies on an unguessable draft ID. BitPlan stores ciphertext on Bitcoin and relies on your wallet keys. Choose postplan if you want zero setup and do not mind a link being the only lock. Choose BitPlan if the plan needs a real lock and a permanent record.",
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
        bitplan: "Bitcoin SV. The site stores nothing.",
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
        bitplan: "Every version stays on chain at one origin.",
        label: "Versioning",
        them: "You publish one chosen version. Iterations live in the chat.",
      },
      {
        bitplan: "Impossible.",
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
        bitplan: "None. A BRC-100 wallet.",
        label: "Account",
        them: "Claude account to publish. None to view public artifacts.",
      },
      {
        bitplan: "Network fee per publish, about 1 satoshi per KB.",
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
        bitplan: "Bitcoin SV. The site stores nothing.",
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
        bitplan: "Every version stays on chain at one origin.",
        label: "Versioning",
        them: "Saved versions and deployed versions, tied to git commits. Redeploy earlier ones.",
      },
      {
        bitplan: "Impossible.",
        label: "Deletion",
        them: "Restrict access, or permanently delete the site.",
      },
      {
        bitplan: "None. No terms, no account, ciphertext only.",
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
        bitplan: "Network fee per publish, about 1 satoshi per KB.",
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
