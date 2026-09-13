import { Hash, PublicKey, Utils } from "@bsv/sdk";

export interface SelectedTeam {
  name: string;
  recipients: string[];
}
const TEAM_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Keep only complete, explicitly selected teams; individual removals dissolve the alias. */
export function selectedTeams(
  value: unknown,
  recipients: string[]
): SelectedTeam[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (team): team is SelectedTeam =>
        !!team &&
        typeof team.name === "string" &&
        TEAM_NAME.test(team.name) &&
        Array.isArray(team.recipients) &&
        team.recipients.length > 0 &&
        team.recipients.every(
          (key: unknown) => typeof key === "string" && recipients.includes(key)
        )
    )
    .map((team) => ({
      name: team.name,
      recipients: [...new Set(team.recipients)],
    }));
}

/** A compact commitment prevents a stale/different CLI team silently widening access. */
export function recipientFingerprint(keys: string[]): string {
  return Utils.toHex(
    Hash.sha256([
      ...new TextEncoder().encode([...new Set(keys)].sort().join("\n")),
    ])
  );
}

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
