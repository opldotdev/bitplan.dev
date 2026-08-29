"use client";

import { FileLock2, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
import type { DraftCoin, DraftsWallet } from "@/lib/drafts";
import { listWalletDrafts } from "@/lib/drafts";
import type { DraftMeta } from "@/lib/envelope";
import { openEnvelope } from "@/lib/envelope";
import { truncateMiddle } from "@/lib/format";
import { fetchOrdfsContent } from "@/lib/ordfs";
import { seqToVersion } from "@/lib/version";
import {
  connectBrowserWallet,
  getConnectedWallet,
  reconnectAuthenticatedWallet,
} from "@/lib/wallet";

interface DraftRow extends DraftCoin {
  latestVersion: number | null;
  meta: DraftMeta | null;
}

type ListState =
  | { phase: "checking" }
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "no-wallet" }
  | { phase: "loaded"; rows: DraftRow[] };

async function toRow(wallet: DraftsWallet, coin: DraftCoin): Promise<DraftRow> {
  try {
    const content = await fetchOrdfsContent(coin.origin, -1);
    if (!content) {
      return { ...coin, latestVersion: null, meta: null };
    }
    const latestVersion = seqToVersion(content.sequence ?? 0);
    const opened = await openEnvelope(wallet, content.bytes);
    return { ...coin, latestVersion, meta: opened.plaintext.meta };
  } catch {
    return { ...coin, latestVersion: null, meta: null };
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

function groupRows(rows: DraftRow[]): [string, DraftRow[]][] {
  const groups = new Map<string, DraftRow[]>();
  for (const row of rows) {
    const label = repoLabel(row.meta);
    const bucket = groups.get(label) ?? [];
    bucket.push(row);
    groups.set(label, bucket);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === "No repository") {
      return 1;
    }
    if (b === "No repository") {
      return -1;
    }
    return a.localeCompare(b);
  });
}

async function loadRows(wallet: DraftsWallet): Promise<DraftRow[]> {
  const coins = await listWalletDrafts(wallet);
  const rows: DraftRow[] = [];
  for (const coin of coins) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose — parallel decrypts would stack wallet permission prompts on first grant
    rows.push(await toRow(wallet, coin));
  }
  return rows;
}

export function DraftsList() {
  const [state, setState] = useState<ListState>({ phase: "checking" });

  const connect = useCallback(async () => {
    setState({ phase: "connecting" });
    try {
      const wallet = await connectBrowserWallet();
      setState({ phase: "loaded", rows: await loadRows(wallet) });
    } catch {
      setState({ phase: "no-wallet" });
    }
  }, []);

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
        const rows = await loadRows(wallet);
        if (!cancelled) {
          setState({ phase: "loaded", rows });
        }
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
  }, []);

  if (state.phase === "checking") {
    return <DraftsSkeleton />;
  }
  if (state.phase === "loaded") {
    return state.rows.length === 0 ? (
      <EmptyDrafts />
    ) : (
      <Groups rows={state.rows} />
    );
  }
  return <ConnectEmpty onConnect={connect} state={state.phase} />;
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
          Publish one with{" "}
          <code className="font-mono">npx bitplan upload ./plan.html</code>.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link href="/docs/cli-setup">CLI setup</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function Groups({ rows }: { rows: DraftRow[] }) {
  return (
    <div className="space-y-8">
      {groupRows(rows).map(([label, group]) => (
        <section key={label}>
          <h2 className="mb-3 font-medium text-muted-foreground text-sm">
            {label}
          </h2>
          <ItemGroup>
            {group.map((row) => (
              <DraftItem key={row.origin} row={row} />
            ))}
          </ItemGroup>
        </section>
      ))}
    </div>
  );
}

function DraftItem({ row }: { row: DraftRow }) {
  return (
    <Item asChild variant="outline">
      <Link className="no-underline" href={`/d/${row.origin}`}>
        <ItemMedia variant="icon">
          <FileLock2 />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>{row.meta?.title ?? "Encrypted draft"}</ItemTitle>
          <ItemDescription>
            {row.meta?.description ?? truncateMiddle(row.origin)}
          </ItemDescription>
        </ItemContent>
        {row.latestVersion ? (
          <ItemActions>
            <Badge variant="secondary">v{row.latestVersion}</Badge>
          </ItemActions>
        ) : null}
        <ItemFooter>
          <span className="truncate font-mono text-muted-foreground text-xs">
            {truncateMiddle(row.origin)}
          </span>
          {row.meta?.createdAt ? (
            <span className="shrink-0 text-muted-foreground text-xs">
              {new Date(row.meta.createdAt).toLocaleDateString()}
            </span>
          ) : null}
        </ItemFooter>
      </Link>
    </Item>
  );
}

function ConnectEmpty({
  onConnect,
  state,
}: {
  onConnect: () => void;
  state: "idle" | "connecting" | "no-wallet";
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
        {state === "no-wallet" ? (
          <p className="text-muted-foreground text-sm">
            No wallet answered. Start BSV Desktop and try again.
          </p>
        ) : null}
      </EmptyContent>
    </Empty>
  );
}
