import { Hash, Utils, type WalletInterface } from "@bsv/sdk";

import { type DraftPlaintext, sealEnvelope, toBase64 } from "@/lib/envelope";

const CONTENT_TYPE = "application/x-bitplan";
const MAX_BODY_LENGTH = 50_000;
const MAX_TITLE_LENGTH = 160;
const RELAY_URL = "https://api.1sat.app/1sat/tx";
const HTML_ENTITIES: Record<string, string> = {
  "'": "&#39;",
  '"': "&quot;",
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

export interface DraftInput {
  body: string;
  repository: string;
  title: string;
}

export interface PublishedDraft {
  origin: string;
  relayed: boolean;
}

export function draftInputFromAgent(value: unknown): DraftInput {
  if (!value || typeof value !== "object") {
    throw new Error("The agent must provide a title and plan.");
  }
  const { body, repository, title } = value as Record<string, unknown>;
  if (
    typeof body !== "string" ||
    typeof title !== "string" ||
    (repository !== undefined && typeof repository !== "string")
  ) {
    throw new Error("The agent must provide a title and plan as text.");
  }
  return { body, repository: repository ?? "", title };
}

interface Repository {
  host: string;
  name: string;
  org: string;
  url: string;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => HTML_ENTITIES[character] ?? character
  );
}

function parseRepository(value: string): Repository | null {
  if (!value.trim()) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch (cause) {
    throw new Error("Repository must be a complete HTTPS URL.", { cause });
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Repository must be a complete HTTPS URL.");
  }
  const path = url.pathname.split("/").filter(Boolean);
  if (path.length < 2) {
    throw new Error("Repository URL must include an owner and repository.");
  }
  url.hash = "";
  url.search = "";
  const rawName = path.at(-1) ?? "";
  const name = rawName.endsWith(".git") ? rawName.slice(0, -4) : rawName;
  const org = path.slice(0, -1).join("/");
  url.pathname = `/${[...path.slice(0, -1), name].join("/")}`;
  return { host: url.hostname, name, org, url: url.toString() };
}

function renderHtml(
  title: string,
  body: string,
  repository: Repository | null
): string {
  const repositoryLink = repository
    ? `<a href="${escapeHtml(repository.url)}">${escapeHtml(`${repository.host}/${repository.org}/${repository.name}`)}</a>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; }
    body { margin: 0 auto; max-width: 760px; padding: 48px 24px 80px; }
    h1 { font-size: clamp(2rem, 8vw, 4rem); letter-spacing: -0.045em; line-height: 1.05; margin: 0 0 1rem; }
    a { color: inherit; overflow-wrap: anywhere; }
    .repo { color: color-mix(in srgb, currentColor 65%, transparent); margin: 0 0 3rem; }
    .plan { font-size: 1.05rem; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${repositoryLink ? `<p class="repo">${repositoryLink}</p>` : ""}
  <div class="plan">${escapeHtml(body)}</div>
</body>
</html>`;
}

export function prepareDraft(
  input: DraftInput,
  createdAt = new Date()
): DraftPlaintext {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) {
    throw new Error("Add a title before reviewing the plan.");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  }
  if (!body) {
    throw new Error("Add the plan before reviewing it.");
  }
  if (body.length > MAX_BODY_LENGTH) {
    throw new Error(`Plan must be ${MAX_BODY_LENGTH} characters or fewer.`);
  }
  const repository = parseRepository(input.repository);
  const html = renderHtml(title, body, repository);
  const fileSha256 = Utils.toHex(
    Hash.sha256(Array.from(new TextEncoder().encode(html)))
  );
  const description = body
    .split("\n")
    .find((line) => line.trim())
    ?.trim();
  return {
    html,
    meta: {
      cliVersion: "web",
      createdAt: createdAt.toISOString(),
      description: description?.slice(0, 160) ?? null,
      fileSha256,
      gitBranch: null,
      gitCommitSha: null,
      gitCommitSubject: null,
      gitDirty: null,
      repoHost: repository?.host ?? null,
      repoName: repository?.name ?? null,
      repoOrg: repository?.org ?? null,
      title,
    },
  };
}

export async function publishDraft(
  wallet: WalletInterface,
  plaintext: DraftPlaintext
): Promise<PublishedDraft> {
  const { createContext, inscribe } = await import("@1sat/actions");
  const envelope = await sealEnvelope(wallet, plaintext, crypto.randomUUID());
  const result = await inscribe.execute(
    createContext(wallet, { chain: "main" }),
    {
      base64Content: toBase64(envelope),
      contentType: CONTENT_TYPE,
      map: { app: "bitplan", enc: "1", type: "plan" },
      usePermissionModule: false,
    }
  );
  if (!(result.txid && result.tx)) {
    throw new Error("The wallet did not publish the plan.");
  }

  let relayed = true;
  try {
    await notifyOrdfs(Uint8Array.from(result.tx), result.txid);
  } catch {
    relayed = false;
  }
  return { origin: `${result.txid}_0`, relayed };
}

async function notifyOrdfs(beef: Uint8Array, txid: string): Promise<void> {
  const body = new ArrayBuffer(beef.byteLength);
  new Uint8Array(body).set(beef);
  const response = await fetch(RELAY_URL, {
    body,
    headers: { "content-type": "application/octet-stream" },
    method: "POST",
    signal: AbortSignal.timeout(45_000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (
    !((response.ok || response.status === 202) && result) ||
    typeof result !== "object" ||
    !("txid" in result) ||
    typeof result.txid !== "string" ||
    result.txid.toLowerCase() !== txid.toLowerCase() ||
    ("txStatus" in result &&
      (result.txStatus === "REJECTED" ||
        result.txStatus === "DOUBLE_SPEND_ATTEMPTED"))
  ) {
    throw new Error("1Sat did not accept the published plan.");
  }
}
