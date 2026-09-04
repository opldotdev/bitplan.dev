import type { CatalogEntry } from "./catalog-client";
import type { EnvelopeWallet } from "./envelope";
import { toOrdinalOutpoint } from "./outpoint";

/**
 * Wallet draft listing. Mirrors the CLI's listBitplanCoins contract
 * (packages/cli/src/ordinals.ts): bitplan coins live in the `1sat` basket
 * and carry a `type:application/x-bitplan` tag; the genesis coin carries a
 * bare `origin` tag while later versions carry `origin:<genesis outpoint>`.
 */

export const BITPLAN_TYPE_TAG = "type:application/x-bitplan";
const ORDINALS_BASKET = "1sat";
const LIST_PAGE_SIZE = 100;

export interface DraftCoin {
  /** Genesis outpoint — the draft's permanent identity. */
  origin: string;
  /** Coin currently holding the latest version. */
  outpoint: string;
}

interface ListedOutput {
  outpoint: string;
  tags?: string[];
}

/** The slice of BRC-100 the drafts list needs beyond decrypt. */
export interface ListingWallet {
  listOutputs: (args: {
    basket: string;
    tags: string[];
    tagQueryMode: "all";
    includeTags: true;
    limit: number;
    offset: number;
  }) => Promise<{ outputs: ListedOutput[] }>;
}

export type DraftsWallet = EnvelopeWallet & ListingWallet;

function toDraftCoin(output: ListedOutput): DraftCoin | null {
  const tags = output.tags ?? [];
  if (!tags.includes(BITPLAN_TYPE_TAG)) {
    return null;
  }

  let outpoint: string;
  try {
    outpoint = toOrdinalOutpoint(output.outpoint);
  } catch {
    return null;
  }

  const originTag = tags.find((tag) => tag.startsWith("origin:"))?.slice(7);
  let origin = outpoint;
  if (originTag) {
    try {
      origin = toOrdinalOutpoint(originTag);
    } catch {
      return null;
    }
  }

  return { origin, outpoint };
}

/** Every bitplan draft the connected wallet holds, one entry per origin. */
export async function listWalletDrafts(
  wallet: ListingWallet
): Promise<DraftCoin[]> {
  const byOrigin = new Map<string, DraftCoin>();
  let offset = 0;

  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: pagination — each request needs the previous page's count
    const result = await wallet.listOutputs({
      basket: ORDINALS_BASKET,
      includeTags: true,
      limit: LIST_PAGE_SIZE,
      offset,
      tagQueryMode: "all",
      tags: [BITPLAN_TYPE_TAG],
    });

    for (const output of result.outputs) {
      const coin = toDraftCoin(output);
      if (coin) {
        byOrigin.set(coin.origin, coin);
      }
    }

    if (result.outputs.length < LIST_PAGE_SIZE) {
      break;
    }
    offset += LIST_PAGE_SIZE;
  }

  return Array.from(byOrigin.values());
}

/**
 * Merged catalog + chain plan list.
 *
 * Catalog entries carry their own title/repository/date metadata. Wallet-held
 * chain coins are enriched later by decrypting their envelopes, so they start
 * with null metadata. An inscribed catalog entry whose chain origin the
 * wallet also holds collapses to the single wallet row.
 */

export type PlanSource = "hosted" | "chain";

export interface MergedPlan {
  description: string | null;
  /** Hosted id for hosted rows, null for wallet-only chain rows. */
  hostedId: string | null;
  key: string;
  /**
   * Viewer target: the hosted id for hosted rows, the chain origin for
   * inscribed and wallet-held rows.
   */
  origin: string;
  repoHost: string | null;
  repoName: string | null;
  repoOrg: string | null;
  source: PlanSource;
  title: string | null;
  updatedAt: string | null;
  updatedAtMillis: number | null;
  version: number | null;
}

function millisOrNull(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function fromCatalogEntry(entry: CatalogEntry): MergedPlan {
  return {
    description: entry.description,
    hostedId: entry.id,
    key: `hosted:${entry.id}`,
    origin:
      entry.state === "inscribed" && entry.chainOrigin
        ? entry.chainOrigin
        : entry.id,
    repoHost: entry.repoHost,
    repoName: entry.repoName,
    repoOrg: entry.repoOrg,
    source: entry.state === "inscribed" ? "chain" : "hosted",
    title: entry.title,
    updatedAt: entry.updatedAt,
    updatedAtMillis: millisOrNull(entry.updatedAt),
    version: entry.version,
  };
}

/**
 * Merge catalog entries with wallet-held chain origins. Dedupe by chain
 * origin when a wallet row exists; the wallet row wins. Sort newest first,
 * with undated rows last and a stable key tiebreak.
 */
export function mergeCatalogPlans(
  entries: readonly CatalogEntry[],
  walletOrigins: readonly string[]
): MergedPlan[] {
  const held = new Set<string>();
  for (const origin of walletOrigins) {
    try {
      held.add(toOrdinalOutpoint(origin));
    } catch {
      // Ignore unparseable origins; the chain loader reports them per row.
    }
  }

  const merged: MergedPlan[] = [];
  const seenHosted = new Set<string>();
  for (const entry of entries) {
    if (seenHosted.has(entry.id)) {
      continue;
    }
    seenHosted.add(entry.id);
    if (entry.state === "inscribed" && entry.chainOrigin) {
      try {
        if (held.has(toOrdinalOutpoint(entry.chainOrigin))) {
          continue;
        }
      } catch {
        // Keep the catalog row; its origin still links to the viewer.
      }
    }
    merged.push(fromCatalogEntry(entry));
  }
  for (const origin of walletOrigins) {
    let normalized: string;
    try {
      normalized = toOrdinalOutpoint(origin);
    } catch {
      continue;
    }
    merged.push({
      description: null,
      hostedId: null,
      key: `chain:${normalized}`,
      origin: normalized,
      repoHost: null,
      repoName: null,
      repoOrg: null,
      source: "chain",
      title: null,
      updatedAt: null,
      updatedAtMillis: null,
      version: null,
    });
  }
  return sortPlansNewestFirst(merged);
}

/** Newest first; undated rows last; stable key tiebreak. */
export function sortPlansNewestFirst(
  rows: readonly MergedPlan[]
): MergedPlan[] {
  return [...rows].sort((a, b) => {
    if (a.updatedAtMillis !== b.updatedAtMillis) {
      if (a.updatedAtMillis === null) {
        return 1;
      }
      if (b.updatedAtMillis === null) {
        return -1;
      }
      return b.updatedAtMillis - a.updatedAtMillis;
    }
    return a.key.localeCompare(b.key);
  });
}

/** Viewer href: hosted rows use /d/<h_id>, chain rows their chain origin. */
export function planViewerHref(plan: Pick<MergedPlan, "origin">): string {
  return `/d/${plan.origin}`;
}

/** Repository label shared by catalog and envelope metadata. */
export function planRepoLabel(plan: {
  repoHost: string | null;
  repoOrg: string | null;
  repoName: string | null;
}): string {
  if (plan.repoOrg && plan.repoName) {
    return `${plan.repoOrg}/${plan.repoName}`;
  }
  if (plan.repoName) {
    return plan.repoName;
  }
  if (plan.repoHost) {
    return plan.repoHost;
  }
  return "No repository";
}

/** Human-readable date, or null when no known date. Never blank upstream. */
export function formatPlanDate(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    return null;
  }
  return new Date(millis).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type PlanFilter = "all" | "hosted" | "chain";

/** Show the All / Hosted / On chain controls only when both types exist. */
export function planFilterOptions(
  rows: readonly Pick<MergedPlan, "source">[]
): PlanFilter[] | null {
  const hasHosted = rows.some((row) => row.source === "hosted");
  const hasChain = rows.some((row) => row.source === "chain");
  if (!(hasHosted && hasChain)) {
    return null;
  }
  return ["all", "hosted", "chain"];
}

export function applyPlanFilter<T extends Pick<MergedPlan, "source">>(
  rows: readonly T[],
  filter: PlanFilter
): T[] {
  if (filter === "all") {
    return [...rows];
  }
  return rows.filter((row) => row.source === filter);
}

/** True only when this wallet holds the latest coin for an origin chain. */
export async function walletOwnsDraft(
  wallet: ListingWallet,
  origin: string,
  latestOutpoint: string | null
): Promise<boolean> {
  if (!latestOutpoint) {
    return false;
  }

  let wantedOrigin: string;
  let wantedOutpoint: string;
  try {
    wantedOrigin = toOrdinalOutpoint(origin);
    wantedOutpoint = toOrdinalOutpoint(latestOutpoint);
  } catch {
    return false;
  }

  const drafts = await listWalletDrafts(wallet);
  return drafts.some(
    (draft) =>
      draft.origin === wantedOrigin && draft.outpoint === wantedOutpoint
  );
}
