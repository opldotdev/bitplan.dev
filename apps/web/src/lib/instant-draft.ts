import { Hash, Utils } from "@bsv/sdk";

import {
  type DraftPlaintext,
  type EncryptingEnvelopeWallet,
  sealEnvelope,
} from "@/lib/envelope";
import { isHostedId } from "@/lib/hosted-id";
import { linkFragment, linkWallet, newLinkSecret } from "@/lib/link-reader";
import { BITPLAN_CONTENT_TYPE } from "@/lib/ordfs";
import type { PlanAppearance } from "@/lib/plan-appearance";

const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const STARTER_LAYOUTS = new Set<StarterLayout>(["blank", "brief", "terminal"]);

export type StarterLayout = PlanAppearance["layout"];

export interface InstantDraftInput {
  layout: StarterLayout;
  title: string;
}

interface HostedCreateResponse {
  id: string;
  version: number;
}

/**
 * Prepare a complete starter for review without creating keys or uploading it.
 */
export async function prepareStarterDraft(
  input: InstantDraftInput,
  fetchImpl: typeof fetch = fetch
): Promise<DraftPlaintext> {
  const title = input.title.trim() || "Untitled plan";
  if (!STARTER_LAYOUTS.has(input.layout)) {
    throw new Error("Choose a recognized BitPlan starter page.");
  }
  if (title.length > 160) {
    throw new Error("Keep the draft name under 160 characters.");
  }

  const template = await fetchImpl(`/templates/${input.layout}.html`, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!template.ok) {
    throw new Error("That starter page is unavailable. Try another one.");
  }
  if (mediaType(template.headers.get("content-type")) !== "text/html") {
    throw new Error("The starter page did not return HTML.");
  }
  const declaredLength = Number(template.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TEMPLATE_BYTES) {
    throw new Error("That starter page is too large.");
  }

  const html = await template.text();
  const htmlBytes = new TextEncoder().encode(html);
  if (htmlBytes.length > MAX_TEMPLATE_BYTES) {
    throw new Error("That starter page is too large.");
  }
  if (!html.includes(`data-bitplan-template="${input.layout}"`)) {
    throw new Error("That starter page is not a recognized BitPlan template.");
  }

  const createdAt = new Date().toISOString();
  const plaintext: DraftPlaintext = {
    html,
    meta: {
      cliVersion: "web",
      createdAt,
      description: `Created from the ${input.layout} starter.`,
      fileSha256: Utils.toHex(Hash.sha256(Array.from(htmlBytes))),
      gitBranch: null,
      gitCommitSha: null,
      gitCommitSubject: null,
      gitDirty: null,
      repoHost: null,
      repoName: null,
      repoOrg: null,
      title,
    },
  };

  return plaintext;
}

/** Open a hosted starter. A supplied wallet never gets a bearer reader fallback. */
export async function createInstantDraft(
  input: InstantDraftInput,
  fetchImpl: typeof fetch = fetch,
  wallet?: EncryptingEnvelopeWallet
): Promise<string> {
  const plaintext = await prepareStarterDraft(input, fetchImpl);
  const readerSecret = wallet ? undefined : newLinkSecret();
  const envelope = await sealEnvelope(
    wallet ?? linkWallet(readerSecret as string),
    plaintext,
    crypto.randomUUID()
  );
  const mutationSecret = readerSecret
    ? distinctCapability(readerSecret)
    : randomBytes(32);
  const response = await fetchImpl("/api/hosted", {
    body: Uint8Array.from(envelope).buffer,
    headers: {
      Authorization: `Bearer ${toBase64Url(mutationSecret)}`,
      "Content-Type": BITPLAN_CONTENT_TYPE,
    },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(await hostedError(response));
  }

  const result = (await response.json()) as Partial<HostedCreateResponse>;
  if (
    typeof result.id !== "string" ||
    !isHostedId(result.id) ||
    result.version !== 1
  ) {
    throw new Error("The hosted draft service returned an invalid response.");
  }
  return readerSecret
    ? `/d/${result.id}?collaborate=1#k=${linkFragment(readerSecret)}`
    : `/d/${result.id}?collaborate=1`;
}

function mediaType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function distinctCapability(readerSecret: string): Uint8Array {
  let bytes = randomBytes(32);
  while (Utils.toHex(bytes) === readerSecret) {
    bytes = randomBytes(32);
  }
  return bytes;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hostedError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message.length <= 300) {
      return body.message;
    }
  } catch {
    // Fall through to a stable, user-facing error.
  }
  return "The encrypted draft could not be saved. Try again.";
}
