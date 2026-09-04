"use client";

import { Check, Cloud, Copy, FileLock2, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CatalogEntry,
  hasCatalogSupport,
  loadCatalog,
} from "@/lib/catalog-client";
import type { DraftCoin, DraftsWallet } from "@/lib/drafts";
import {
  applyPlanFilter,
  formatPlanDate,
  listWalletDrafts,
  type MergedPlan,
  mergeCatalogPlans,
  type PlanFilter,
  planFilterOptions,
  planRepoLabel,
  planViewerHref,
} from "@/lib/drafts";
import type { DraftMeta } from "@/lib/envelope";
import {
  EnvelopeAccessError,
  EnvelopeError,
  openEnvelope,
} from "@/lib/envelope";
import { truncateMiddle } from "@/lib/format";
import { fetchOrdfsContent, type OrdfsContentResult } from "@/lib/ordfs";
import { normalizeIdentityKey } from "@/lib/sharing";
import { seqToVersion } from "@/lib/version";
import {
  connectBrowserWallet,
  getConnectedWallet,
  reconnectAuthenticatedWallet,
} from "@/lib/wallet";

export type ChainFailure = "retryable" | "unsupported" | "not-authorized";

const UNSUPPORTED_MESSAGE = /unsupported/i;

/**
 * Map a chain-row load outcome onto the three distinct failure states.
 * Anything that is not provably unsupported or wrong-wallet stays retryable.
 */
export function classifyChainFailure(
  fetch: OrdfsContentResult,
  openError: unknown
): ChainFailure {
  if (fetch.state === "invalid-content") {
    return "unsupported";
  }
  if (fetch.state !== "found") {
    return "retryable";
  }
  if (openError instanceof EnvelopeAccessError) {
    return "not-authorized";
  }
  if (
    openError instanceof EnvelopeError &&
    UNSUPPORTED_MESSAGE.test(openError.message)
  ) {
    return "unsupported";
  }
  return "retryable";
}

export type ChainDetail =
  | { status: "ok"; meta: DraftMeta; latestVersion: number | null }
  | { status: "retryable" }
  | { status: "unsupported" }
  | { status: "not-authorized" };

export interface ViewRow {
  /** Null for hosted catalog rows, which carry their own metadata. */
  detail: ChainDetail | null;
  plan: MergedPlan;
}

export type CatalogPhase =
  | { state: "loading" }
  | { state: "absent" }
  | { state: "ready" }
  | { state: "error" };

type ListState =
  | { phase: "checking" }
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "wallet-error" }
  | {
      phase: "loaded";
      catalog: CatalogPhase;
      coins: DraftCoin[];
      details: Record<string, ChainDetail>;
      hosted: CatalogEntry[];
      reloadingRows: string[];
      wallet: DraftsWallet;
    };

async function loadChainDetail(
  wallet: DraftsWallet,
  origin: string
): Promise<ChainDetail> {
  const result = await fetchOrdfsContent(origin, -1);
  if (result.state !== "found") {
    return { status: classifyChainFailure(result, null) };
  }
  const latestVersion = seqToVersion(result.content.sequence ?? 0);
  try {
    const opened = await openEnvelope(wallet, result.content.bytes);
    return { latestVersion, meta: opened.plaintext.meta, status: "ok" };
  } catch (error) {
    return { status: classifyChainFailure(result, error) };
  }
}

function repoLabel(meta: DraftMeta | null): string {
  if (meta?.repoOrg && meta.repoName) {
    return `${meta.repoOrg}/${meta.repoName}`;
  }
  if (meta?.repoName) {
    return meta.repoName;
  }
  return "No repository";
}

function rowDateMillis(row: ViewRow): number | null {
  if (row.detail?.status === "ok") {
    const millis = Date.parse(row.detail.meta.createdAt);
    return Number.isFinite(millis) ? millis : row.plan.updatedAtMillis;
  }
  return row.plan.updatedAtMillis;
}

function rowDateLabel(row: ViewRow): string {
  if (row.detail?.status === "ok") {
    return formatPlanDate(row.detail.meta.createdAt) ?? "Date unavailable";
  }
  return formatPlanDate(row.plan.updatedAt) ?? "Date unavailable";
}

export function buildRows(
  plans: MergedPlan[],
  details: Record<string, ChainDetail>
): ViewRow[] {
  const rows = plans.map((plan): ViewRow => {
    if (plan.source === "hosted") {
      return { detail: null, plan };
    }
    const detail = details[plan.origin];
    return {
      detail: detail ?? { status: "retryable" },
      plan,
    };
  });
  return rows.sort((a, b) => {
    const millisA = rowDateMillis(a);
    const millisB = rowDateMillis(b);
    if (millisA !== millisB) {
      if (millisA === null) {
        return 1;
      }
      if (millisB === null) {
        return -1;
      }
      return millisB - millisA;
    }
    return a.plan.key.localeCompare(b.plan.key);
  });
}

function groupRows(rows: ViewRow[]): [string, ViewRow[]][] {
  const groups = new Map<string, ViewRow[]>();
  for (const row of rows) {
    const label =
      row.detail?.status === "ok"
        ? repoLabel(row.detail.meta)
        : planRepoLabel(row.plan);
    const bucket = groups.get(label) ?? [];
    bucket.push(row);
    groups.set(label, bucket);
  }
  return Array.from(groups.entries()).sort(([, a], [, b]) => {
    const newest = (group: ViewRow[]): number | null => {
      let best: number | null = null;
      for (const row of group) {
        const millis = rowDateMillis(row);
        if (millis !== null && (best === null || millis > best)) {
          best = millis;
        }
      }
      return best;
    };
    const dateA = newest(a);
    const dateB = newest(b);
    if (dateA !== dateB) {
      if (dateA === null) {
        return 1;
      }
      if (dateB === null) {
        return -1;
      }
      return dateB - dateA;
    }
    const keyA = a[0]?.plan.key ?? "";
    const keyB = b[0]?.plan.key ?? "";
    return keyA.localeCompare(keyB);
  });
}

async function loadHosted(
  wallet: DraftsWallet
): Promise<{ entries: CatalogEntry[]; error: boolean }> {
  if (!hasCatalogSupport(wallet)) {
    return { entries: [], error: true };
  }
  const loaded = await loadCatalog(wallet);
  if (loaded.state === "ready") {
    return { entries: loaded.catalog.entries, error: false };
  }
  if (loaded.state === "missing") {
    return { entries: [], error: false };
  }
  return { entries: [], error: true };
}

/**
 * Chain origins needing envelope details: the union of wallet-held origins
 * and catalog entries in the `inscribed` state, deduped. A catalog-only
 * inscribed plan must load normally even after the ordinal leaves the wallet.
 */
export function chainOriginsForDetails(
  coins: readonly Pick<DraftCoin, "origin">[],
  entries: readonly CatalogEntry[]
): string[] {
  const seen = new Set<string>();
  const origins: string[] = [];
  for (const coin of coins) {
    if (!seen.has(coin.origin)) {
      seen.add(coin.origin);
      origins.push(coin.origin);
    }
  }
  for (const entry of entries) {
    if (
      entry.state === "inscribed" &&
      entry.chainOrigin &&
      !seen.has(entry.chainOrigin)
    ) {
      seen.add(entry.chainOrigin);
      origins.push(entry.chainOrigin);
    }
  }
  return origins;
}

async function loadChainDetails(
  wallet: DraftsWallet,
  origins: readonly string[]
): Promise<Record<string, ChainDetail>> {
  const details: Record<string, ChainDetail> = {};
  for (const origin of origins) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose — parallel decrypts would stack wallet permission prompts on first grant
    details[origin] = await loadChainDetail(wallet, origin);
  }
  return details;
}

export function DraftsList() {
  const [state, setState] = useState<ListState>({ phase: "checking" });

  const bootWallet = useCallback(async (wallet: DraftsWallet) => {
    const [coins, hosted] = await Promise.all([
      listWalletDrafts(wallet),
      loadHosted(wallet),
    ]);
    const details = await loadChainDetails(
      wallet,
      chainOriginsForDetails(coins, hosted.entries)
    );
    setState({
      catalog: hosted.error ? { state: "error" } : { state: "ready" },
      coins,
      details,
      hosted: hosted.entries,
      phase: "loaded",
      reloadingRows: [],
      wallet,
    });
  }, []);

  const connect = useCallback(async () => {
    setState({ phase: "connecting" });
    try {
      await bootWallet(await connectBrowserWallet());
    } catch {
      setState({ phase: "wallet-error" });
    }
  }, [bootWallet]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const wallet =
        getConnectedWallet() ?? (await reconnectAuthenticatedWallet());
      if (cancelled) {
        return;
      }
      if (!wallet) {
        setState({ phase: "idle" });
        return;
      }
      try {
        await bootWallet(wallet);
      } catch {
        if (!cancelled) {
          setState({ phase: "idle" });
        }
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [bootWallet]);

  const retryCatalog = useCallback(async () => {
    setState((current) => {
      if (current.phase !== "loaded") {
        return current;
      }
      return { ...current, catalog: { state: "loading" } };
    });
    const wallet =
      getConnectedWallet() ??
      (await reconnectAuthenticatedWallet().catch(() => null));
    if (!wallet) {
      setState({ phase: "idle" });
      return;
    }
    try {
      const hosted = await loadHosted(wallet);
      let freshCoins: DraftCoin[] | null = null;
      try {
        freshCoins = await listWalletDrafts(wallet);
      } catch {
        freshCoins = null;
      }
      const origins = chainOriginsForDetails(freshCoins ?? [], hosted.entries);
      const details = await loadChainDetails(wallet, origins);
      setState((previous) => {
        if (previous.phase !== "loaded") {
          return previous;
        }
        return {
          ...previous,
          catalog: hosted.error ? { state: "error" } : { state: "ready" },
          coins: freshCoins ?? previous.coins,
          details: freshCoins ? details : { ...previous.details, ...details },
          hosted: hosted.entries,
          wallet,
        };
      });
    } catch {
      setState((previous) => {
        if (previous.phase !== "loaded") {
          return previous;
        }
        return { ...previous, catalog: { state: "error" } };
      });
    }
  }, []);

  const retryRow = useCallback(async (origin: string) => {
    const wallet = getConnectedWallet();
    if (!wallet) {
      return;
    }
    setState((current) => {
      if (
        current.phase !== "loaded" ||
        current.reloadingRows.includes(origin)
      ) {
        return current;
      }
      return { ...current, reloadingRows: [...current.reloadingRows, origin] };
    });
    try {
      const detail = await loadChainDetail(wallet, origin);
      setState((current) => {
        if (current.phase !== "loaded") {
          return current;
        }
        return {
          ...current,
          details: { ...current.details, [origin]: detail },
          reloadingRows: current.reloadingRows.filter((key) => key !== origin),
        };
      });
    } catch {
      setState((current) => {
        if (current.phase !== "loaded") {
          return current;
        }
        return {
          ...current,
          reloadingRows: current.reloadingRows.filter((key) => key !== origin),
        };
      });
    }
  }, []);

  if (state.phase === "checking") {
    return <DraftsSkeleton />;
  }
  if (state.phase === "loaded") {
    return (
      <LoadedDrafts
        catalog={state.catalog}
        coins={state.coins}
        details={state.details}
        hosted={state.hosted}
        onRetryCatalog={retryCatalog}
        onRetryRow={retryRow}
        reloadingRows={state.reloadingRows}
        wallet={state.wallet}
      />
    );
  }
  return <ConnectEmpty onConnect={connect} state={state.phase} />;
}

export async function walletIdentityKey(
  wallet: Pick<DraftsWallet, "getPublicKey">
): Promise<string> {
  const result = await wallet.getPublicKey({ identityKey: true });
  if (!result.publicKey) {
    throw new Error("The wallet did not return an identity key.");
  }
  const identityKey = normalizeIdentityKey(result.publicKey);
  if (!identityKey) {
    throw new Error("The wallet returned an invalid identity key.");
  }
  return identityKey;
}

/** Exported for behavioral tests; the list wires the live callbacks. */
export function LoadedDrafts({
  catalog,
  coins,
  details,
  hosted,
  onRetryCatalog,
  onRetryRow,
  reloadingRows,
  wallet,
}: {
  catalog: CatalogPhase;
  coins: DraftCoin[];
  details: Record<string, ChainDetail>;
  hosted: CatalogEntry[];
  onRetryCatalog: () => void;
  onRetryRow: (origin: string) => void;
  reloadingRows: string[];
  wallet: DraftsWallet;
}) {
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<PlanFilter>("all");

  const copyWalletId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(await walletIdentityKey(wallet));
      setCopied(true);
      toast.success("Wallet ID copied");
    } catch {
      setCopied(false);
      toast.error("Could not copy the wallet ID");
    }
  }, [wallet]);

  const showAll = useCallback(() => setFilter("all"), []);
  const showHosted = useCallback(() => setFilter("hosted"), []);
  const showChain = useCallback(() => setFilter("chain"), []);

  const plans = mergeCatalogPlans(
    hosted,
    coins.map((coin) => coin.origin)
  );
  const options = planFilterOptions(plans);
  const visible = buildRows(
    applyPlanFilter(plans, options ? filter : "all"),
    details
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {options ? (
          <fieldset className="flex gap-1">
            <legend className="sr-only">Filter drafts</legend>
            <Button
              onClick={showAll}
              size="sm"
              type="button"
              variant={filter === "all" ? "secondary" : "ghost"}
            >
              All
            </Button>
            <Button
              onClick={showHosted}
              size="sm"
              type="button"
              variant={filter === "hosted" ? "secondary" : "ghost"}
            >
              Hosted
            </Button>
            <Button
              onClick={showChain}
              size="sm"
              type="button"
              variant={filter === "chain" ? "secondary" : "ghost"}
            >
              On chain
            </Button>
          </fieldset>
        ) : (
          <span />
        )}
        <Button onClick={copyWalletId} size="sm" type="button" variant="ghost">
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy wallet ID"}
        </Button>
      </div>
      {catalog.state === "error" ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Could not load hosted plans.
          </span>
          <Button
            onClick={onRetryCatalog}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry
          </Button>
        </div>
      ) : null}
      {catalog.state === "loading" ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}
      {visible.length === 0 ? (
        <MaybeEmptyDrafts catalog={catalog} />
      ) : (
        <Groups
          onRetryRow={onRetryRow}
          reloadingRows={reloadingRows}
          rows={visible}
        />
      )}
    </div>
  );
}

/**
 * Empty-state copy only when the catalog is known (ready or absent). While
 * discovery is loading or has failed with zero chain rows, the warning or
 * loading state speaks alone — never a false "no drafts" claim.
 */
function MaybeEmptyDrafts({ catalog }: { catalog: CatalogPhase }) {
  if (catalog.state !== "ready" && catalog.state !== "absent") {
    return null;
  }
  return <EmptyDrafts />;
}

function DraftsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function EmptyDrafts() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileLock2 />
        </EmptyMedia>
        <EmptyTitle>No drafts in this wallet yet</EmptyTitle>
        <EmptyDescription>
          Create one here, or publish HTML with the BitPlan CLI.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function Groups({
  onRetryRow,
  reloadingRows,
  rows,
}: {
  onRetryRow: (origin: string) => void;
  reloadingRows: string[];
  rows: ViewRow[];
}) {
  return (
    <div className="space-y-8">
      {groupRows(rows).map(([label, group]) => (
        <section key={label}>
          <h2 className="mb-3 font-medium text-muted-foreground text-sm">
            {label}
          </h2>
          <ItemGroup>
            {group.map((row) => (
              <PlanItem
                key={row.plan.key}
                onRetryRow={onRetryRow}
                reloading={reloadingRows.includes(row.plan.origin)}
                row={row}
              />
            ))}
          </ItemGroup>
        </section>
      ))}
    </div>
  );
}

function PlanItem({
  onRetryRow,
  reloading,
  row,
}: {
  onRetryRow: (origin: string) => void;
  reloading: boolean;
  row: ViewRow;
}) {
  if (row.detail === null) {
    return <HostedItem row={row} />;
  }
  if (row.detail.status === "ok") {
    return <ChainItem row={row} />;
  }
  return (
    <FailedChainItem onRetryRow={onRetryRow} reloading={reloading} row={row} />
  );
}

function HostedItem({ row }: { row: ViewRow }) {
  const { plan } = row;
  return (
    <Item asChild variant="outline">
      <Link className="no-underline" href={planViewerHref(plan)}>
        <ItemMedia variant="icon">
          <Cloud />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>{plan.title ?? "Untitled plan"}</ItemTitle>
          {plan.description ? (
            <ItemDescription>{plan.description}</ItemDescription>
          ) : null}
        </ItemContent>
        <ItemActions>
          <Badge variant="secondary">Hosted</Badge>
          {plan.version ? (
            <Badge variant="outline">v{plan.version}</Badge>
          ) : null}
        </ItemActions>
        <ItemFooter>
          <span className="truncate text-muted-foreground text-xs">
            {planRepoLabel(plan)}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {rowDateLabel(row)}
          </span>
        </ItemFooter>
      </Link>
    </Item>
  );
}

function ChainItem({ row }: { row: ViewRow }) {
  const { plan } = row;
  const detail =
    row.detail?.status === "ok"
      ? row.detail
      : { latestVersion: null, meta: null };
  const { meta } = detail;
  return (
    <Item asChild variant="outline">
      <Link className="no-underline" href={planViewerHref(plan)}>
        <ItemMedia variant="icon">
          <FileLock2 />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>{meta?.title ?? "Encrypted draft"}</ItemTitle>
          <ItemDescription>
            {meta?.description ?? truncateMiddle(plan.origin)}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="secondary">On chain</Badge>
          {detail.latestVersion ? (
            <Badge variant="outline">v{detail.latestVersion}</Badge>
          ) : null}
        </ItemActions>
        <ItemFooter>
          <span className="truncate font-mono text-muted-foreground text-xs">
            {truncateMiddle(plan.origin)}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {rowDateLabel(row)}
          </span>
        </ItemFooter>
      </Link>
    </Item>
  );
}

function FailedChainItem({
  onRetryRow,
  reloading,
  row,
}: {
  onRetryRow: (origin: string) => void;
  reloading: boolean;
  row: ViewRow;
}) {
  const { origin } = row.plan;
  const handleRetry = useCallback(
    () => onRetryRow(origin),
    [onRetryRow, origin]
  );
  const detailStatus = row.detail?.status ?? "retryable";
  const failure = detailStatus === "ok" ? "retryable" : detailStatus;
  if (failure === "unsupported") {
    return (
      <Item variant="outline">
        <ItemMedia variant="icon">
          <FileLock2 />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>Unsupported or invalid format</ItemTitle>
          <ItemDescription>
            This plan cannot be opened by the current BitPlan.
          </ItemDescription>
        </ItemContent>
        <ItemFooter>
          <span className="truncate font-mono text-muted-foreground text-xs">
            {truncateMiddle(row.plan.origin)}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {rowDateLabel(row)}
          </span>
        </ItemFooter>
      </Item>
    );
  }
  if (failure === "not-authorized") {
    return (
      <Item variant="outline">
        <ItemMedia variant="icon">
          <FileLock2 />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>Not available to this wallet</ItemTitle>
          <ItemDescription>
            Connect the wallet that was granted access to this plan.
          </ItemDescription>
        </ItemContent>
        <ItemFooter>
          <span className="truncate font-mono text-muted-foreground text-xs">
            {truncateMiddle(row.plan.origin)}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {rowDateLabel(row)}
          </span>
        </ItemFooter>
      </Item>
    );
  }
  return (
    <Item variant="outline">
      <ItemMedia variant="icon">
        <FileLock2 />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>Could not load this plan</ItemTitle>
        <ItemDescription>Network or wallet request failed.</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          disabled={reloading}
          onClick={handleRetry}
          size="sm"
          type="button"
          variant="outline"
        >
          {reloading ? "Retrying…" : "Retry"}
        </Button>
      </ItemActions>
      <ItemFooter>
        <span className="truncate font-mono text-muted-foreground text-xs">
          {truncateMiddle(row.plan.origin)}
        </span>
        <span className="shrink-0 text-muted-foreground text-xs">
          {rowDateLabel(row)}
        </span>
      </ItemFooter>
    </Item>
  );
}

function ConnectEmpty({
  onConnect,
  state,
}: {
  onConnect: () => void;
  state: "idle" | "connecting" | "wallet-error";
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Wallet />
        </EmptyMedia>
        <EmptyTitle>Connect a wallet</EmptyTitle>
        <EmptyDescription>
          The list comes from the BRC-100 wallet on this machine.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          disabled={state === "connecting"}
          onClick={onConnect}
          type="button"
        >
          {state === "connecting" ? "Connecting…" : "Connect wallet"}
        </Button>
        {state === "wallet-error" ? (
          <p className="text-muted-foreground text-sm">
            Could not connect to or read from the wallet. Start or unlock a
            compatible BRC-100 wallet, such as BSV Desktop, and try again.
          </p>
        ) : null}
      </EmptyContent>
    </Empty>
  );
}
