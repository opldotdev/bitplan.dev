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
