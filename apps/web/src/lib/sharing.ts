import { PublicKey } from "@bsv/sdk";

const COMPRESSED_IDENTITY_KEY = /^(02|03)[0-9a-f]{64}$/i;
const IDENTITY_KEY_SEPARATOR = /[\s,]+/;

export interface ParsedIdentityKeys {
  invalid: string[];
  valid: string[];
}

export function parseIdentityKeys(value: string): ParsedIdentityKeys {
  const valid = new Set<string>();
  const invalid = new Set<string>();
  for (const token of value.split(IDENTITY_KEY_SEPARATOR)) {
    const identityKey = token.trim();
    if (!identityKey) {
      continue;
    }
    const normalized = normalizeIdentityKey(identityKey);
    if (normalized) {
      valid.add(normalized);
    } else {
      invalid.add(identityKey);
    }
  }
  return { invalid: [...invalid], valid: [...valid] };
}

export function normalizeIdentityKey(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!COMPRESSED_IDENTITY_KEY.test(normalized)) {
    return null;
  }
  try {
    const canonical = PublicKey.fromString(normalized).toString().toLowerCase();
    return canonical === normalized ? canonical : null;
  } catch {
    return null;
  }
}

export function buildShareInstructions(
  origin: string,
  identityKeys: string[]
): string {
  const flags = identityKeys
    .map((identityKey) => `  --share-with ${identityKey}`)
    .join(" \\\n");

  return `Grant these identity keys read access to the next version of the BitPlan draft at ${origin}.

Use the local source HTML and the BitPlan CLI. Do not handle private keys or encrypt the file yourself. Run:

npx bitplan upload ./plan.html --draft ${origin} \\
${flags}

Replace ./plan.html with the actual local source path when needed. The CLI preserves the draft's current readers and asks the connected BRC-100 wallet to wrap the shared document key for each reader. Review the wallet prompts and publish the version. By default, the CLI notifies 1Sat for ORDFS capture after the wallet publishes. Do not use --private or --no-relay. Older on-chain versions and their access lists cannot be changed.`;
}

export function buildReaderLinkInstructions(origin: string): string {
  return `Create a reader link for the hosted BitPlan at ${origin}.

On the computer that published this plan, use its local source HTML and run:

npx bitplan upload ./plan.html --draft ${origin} --link

Replace ./plan.html with the actual local source path. The BitPlan CLI needs the hosted draft's locally saved publishing secret. It will publish a new version and return a complete URL containing #k=. Anyone with that complete URL can read the plan, so treat it like a password. Do not use --private.`;
}
