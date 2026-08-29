"use client";

import { FileLock2, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DraftCoin, DraftsWallet } from "@/lib/drafts";
import { listWalletDrafts } from "@/lib/drafts";
import type { DraftMeta } from "@/lib/envelope";
import { openEnvelope } from "@/lib/envelope";
import { truncateMiddle } from "@/lib/format";
import { fetchOrdfsContent } from "@/lib/ordfs";
import { seqToVersion } from "@/lib/version";
import { connectBrowserWallet, getConnectedWallet } from "@/lib/wallet";

interface DraftRow extends DraftCoin {
  latestVersion: number | null;
  meta: DraftMeta | null;
}

type ListState =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "no-wallet" }
  | { phase: "loaded"; rows: DraftRow[] };

/**
 * Decrypt metadata best-effort: the first unwrap raises the wallet's
 * permission prompt; later ones ride the same grant. A draft whose key this
 * wallet cannot unwrap still lists — by origin, untitled.
 */
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

/** Postplan groups the dashboard by auto-linked repo; mirror that. */
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
  const [state, setState] = useState<ListState>({ phase: "idle" });

  const connect = useCallback(async () => {
    setState({ phase: "connecting" });
    try {
      const wallet = await connectBrowserWallet();
      setState({ phase: "loaded", rows: await loadRows(wallet) });
    } catch {
      setState({ phase: "no-wallet" });
    }
  }, []);

  // A wallet connected earlier in this tab (e.g. on the viewer) lists
  // without a fresh click; a cold visit stays idle until the user connects.
  useEffect(() => {
    const wallet = getConnectedWallet();
    if (wallet) {
      loadRows(wallet)
        .then((rows) => setState({ phase: "loaded", rows }))
        .catch(() => setState({ phase: "idle" }));
    }
  }, []);

  if (state.phase === "loaded") {
    return state.rows.length === 0 ? (
      <EmptyState />
    ) : (
      <Groups rows={state.rows} />
    );
  }
  return <ConnectCard onConnect={connect} state={state.phase} />;
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="space-y-2 py-8 text-center">
        <p>No drafts in this wallet yet.</p>
        <p className="text-muted-foreground text-sm">
          Publish one with{" "}
          <code className="font-mono">npx bitplan upload ./plan.html</code>
          {" or "}
          <code className="font-mono">bunx bitplan upload ./plan.html</code>
        </p>
      </CardContent>
    </Card>
  );
}

function Groups({ rows }: { rows: DraftRow[] }) {
  return (
    <div className="space-y-8">
      {groupRows(rows).map(([label, group]) => (
        <section key={label}>
          <h2 className="mb-3 font-semibold">{label}</h2>
          <ul className="space-y-3">
            {group.map((row) => (
              <DraftRowCard key={row.origin} row={row} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DraftRowCard({ row }: { row: DraftRow }) {
  const subtitle = [
    truncateMiddle(row.origin),
    row.latestVersion ? `v${row.latestVersion}` : null,
    row.meta?.createdAt
      ? new Date(row.meta.createdAt).toLocaleDateString()
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <Link className="block no-underline" href={`/d/${row.origin}`}>
        <Card className="transition-colors hover:border-muted-foreground/40">
          <CardContent className="flex items-center gap-4 py-4">
            <FileLock2
              aria-hidden
              className="size-5 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {row.meta?.title ?? "Encrypted draft"}
              </p>
              {row.meta?.description && (
                <p className="truncate text-muted-foreground text-sm">
                  {row.meta.description}
                </p>
              )}
              <p className="truncate font-mono text-muted-foreground text-xs">
                {subtitle}
              </p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}

function ConnectCard({
  onConnect,
  state,
}: {
  onConnect: () => void;
  state: "idle" | "connecting" | "no-wallet";
}) {
  return (
    <Card>
      <CardContent className="space-y-4 py-8 text-center">
        <Wallet aria-hidden className="mx-auto size-6 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">
          Connect the wallet that published these drafts. The list comes from
          the wallet.
        </p>
        <Button
          className="w-full"
          disabled={state === "connecting"}
          onClick={onConnect}
          type="button"
        >
          {state === "connecting" ? "Connecting…" : "Connect wallet"}
        </Button>
        {state === "no-wallet" && (
          <p className="text-muted-foreground text-sm">
            No BRC-100 wallet answered on this machine. Start BSV Desktop (or
            another BRC-100 wallet) and try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
