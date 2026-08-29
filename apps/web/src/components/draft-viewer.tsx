"use client";

import { Check, Copy, Info, Lock } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import type { DraftMeta, DraftPlaintext, EnvelopeWallet } from "@/lib/envelope";
import { openEnvelope } from "@/lib/envelope";
import { formatByteSize, truncateMiddle } from "@/lib/format";
import { fetchOrdfsContent, type OrdfsContent } from "@/lib/ordfs";
import { normalizeOrigin } from "@/lib/outpoint";
import {
  clampVersion,
  parseVersionQuery,
  seqToVersion,
  versionToSeq,
} from "@/lib/version";
import { connectBrowserWallet } from "@/lib/wallet";

type WalletIssue = "no-wallet" | "unwrap-refused";

interface LoadedDraft {
  origin: string;
  content: OrdfsContent;
  latestVersion: number;
  currentVersion: number;
}

export function DraftResolving() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ViewerHeader />
      <div className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col justify-center px-6 py-10">
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-9 w-56" />
        </div>
      </div>
    </div>
  );
}

export function DraftViewer() {
  const params = useParams<{ origin: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const originParam = params.origin ?? "";
  const requestedVersion = parseVersionQuery(searchParams.get("v"));

  const [loaded, setLoaded] = useState<LoadedDraft | null>(null);
  const [notFoundOrigin, setNotFoundOrigin] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  const [plaintext, setPlaintext] = useState<DraftPlaintext | null>(null);
  const [walletIssue, setWalletIssue] = useState<WalletIssue | null>(null);
  const [busy, setBusy] = useState(false);

  const walletRef = useRef<EnvelopeWallet | null>(null);
  const decryptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setResolving(true);
      setNotFoundOrigin(null);

      const origin = normalizeOrigin(originParam);
      if (!origin) {
        if (!cancelled) {
          setLoaded(null);
          setPlaintext(null);
          setNotFoundOrigin(originParam);
          setResolving(false);
        }
        return;
      }

      const latest = await fetchOrdfsContent(origin, -1);
      if (cancelled) {
        return;
      }
      if (!latest) {
        setLoaded(null);
        setPlaintext(null);
        setNotFoundOrigin(origin);
        setResolving(false);
        return;
      }

      const latestVersion = seqToVersion(latest.sequence ?? 0);
      const currentVersion = clampVersion(
        requestedVersion ?? latestVersion,
        latestVersion
      );

      let content = latest;
      if (currentVersion !== latestVersion) {
        const pinned = await fetchOrdfsContent(
          origin,
          versionToSeq(currentVersion)
        );
        if (cancelled) {
          return;
        }
        if (!pinned) {
          setLoaded(null);
          setPlaintext(null);
          setNotFoundOrigin(origin);
          setResolving(false);
          return;
        }
        content = pinned;
      }

      const next: LoadedDraft = {
        origin,
        content,
        latestVersion,
        currentVersion,
      };
      setLoaded(next);
      setNotFoundOrigin(null);
      setWalletIssue(null);

      if (decryptedRef.current && walletRef.current) {
        try {
          const opened = await openEnvelope(walletRef.current, content.bytes);
          if (!cancelled) {
            setPlaintext(opened.plaintext);
          }
        } catch {
          if (!cancelled) {
            setPlaintext(null);
            setWalletIssue("unwrap-refused");
          }
        }
      } else {
        setPlaintext(null);
      }

      setResolving(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [originParam, requestedVersion]);

  const handleConnect = useCallback(async () => {
    if (!loaded || busy) {
      return;
    }
    setBusy(true);
    setWalletIssue(null);

    try {
      if (!walletRef.current) {
        walletRef.current = await connectBrowserWallet();
      }
    } catch {
      setWalletIssue("no-wallet");
      setBusy(false);
      return;
    }

    try {
      const opened = await openEnvelope(walletRef.current, loaded.content.bytes);
      decryptedRef.current = true;
      setPlaintext(opened.plaintext);
      setWalletIssue(null);
    } catch {
      setWalletIssue("unwrap-refused");
    } finally {
      setBusy(false);
    }
  }, [busy, loaded]);

  const handleVersion = useCallback(
    (version: number) => {
      if (!loaded || version === loaded.currentVersion) {
        return;
      }
      const query = version === loaded.latestVersion ? "" : `?v=${version}`;
      router.replace(`/d/${loaded.origin}${query}`, { scroll: false });
    },
    [loaded, router]
  );

  if (resolving && !loaded) {
    return <DraftResolving />;
  }

  if (notFoundOrigin !== null && !loaded) {
    return (
      <div className="flex min-h-dvh flex-col">
        <ViewerHeader />
        <main className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col justify-center px-6 py-10">
          <Card>
            <CardHeader>
              <CardTitle>No draft at this origin.</CardTitle>
              <CardDescription className="break-all font-mono">
                {notFoundOrigin}
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  if (!loaded) {
    return <DraftResolving />;
  }

  if (plaintext) {
    return (
      <DecryptedView
        currentVersion={loaded.currentVersion}
        latestVersion={loaded.latestVersion}
        onVersion={handleVersion}
        plaintext={plaintext}
      />
    );
  }

  return (
    <EncryptedView
      busy={busy}
      content={loaded.content}
      currentVersion={loaded.currentVersion}
      latestVersion={loaded.latestVersion}
      onConnect={handleConnect}
      origin={loaded.origin}
      walletIssue={walletIssue}
    />
  );
}

function ViewerHeader() {
  return (
    <header className="mx-auto flex w-full max-w-[42rem] items-center justify-between px-6 py-6">
      <Wordmark />
      <ThemeToggle />
    </header>
  );
}

function Wordmark() {
  return (
    <Link className="font-semibold text-foreground no-underline" href="/">
      BitPlan
      <span className="text-primary">.</span>
    </Link>
  );
}

function EncryptedView({
  origin,
  content,
  currentVersion,
  latestVersion,
  walletIssue,
  busy,
  onConnect,
}: {
  origin: string;
  content: OrdfsContent;
  currentVersion: number;
  latestVersion: number;
  walletIssue: WalletIssue | null;
  busy: boolean;
  onConnect: () => void;
}) {
  const isLatest = currentVersion === latestVersion;
  const versionLabel = isLatest
    ? `v${currentVersion} · latest`
    : `v${currentVersion} of ${latestVersion}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <ViewerHeader />
      <main className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col justify-center px-6 py-10">
        <Card>
          <CardHeader className="items-center text-center">
            <Lock
              aria-hidden
              className="size-6 text-muted-foreground"
            />
            <CardTitle>Encrypted draft</CardTitle>
            <OriginCopy origin={origin} />
          </CardHeader>
          <CardContent className="space-y-6">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Size</dt>
              <dd>{formatByteSize(content.bytes.byteLength)}</dd>
              <dt className="text-muted-foreground">Version</dt>
              <dd>{versionLabel}</dd>
              <dt className="text-muted-foreground">Content type</dt>
              <dd className="font-mono text-xs">{content.contentType}</dd>
            </dl>
            <div className="space-y-2">
              <Button
                className="w-full"
                disabled={busy}
                onClick={onConnect}
                type="button"
              >
                {walletIssue ? "Try again" : "Connect wallet to decrypt"}
              </Button>
              {walletIssue ? (
                <p className="text-center text-destructive text-sm">
                  {walletIssue === "no-wallet"
                    ? "No BRC-100 wallet answered on this machine."
                    : "The wallet declined to unwrap this draft's key."}
                </p>
              ) : null}
              <p className="text-center text-muted-foreground text-sm">
                Only a wallet holding this draft&apos;s key can read it.
                bitplan.dev stores nothing.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function DecryptedView({
  plaintext,
  currentVersion,
  latestVersion,
  onVersion,
}: {
  plaintext: DraftPlaintext;
  currentVersion: number;
  latestVersion: number;
  onVersion: (version: number) => void;
}) {
  const title = plaintext.meta.title;
  const versions = Array.from({ length: latestVersion }, (_, i) => i + 1);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-border border-b px-4 py-2">
        <Wordmark />
        <nav aria-label="Draft versions" className="flex flex-wrap gap-1">
          {versions.map((version) => {
            const current = version === currentVersion;
            return (
              <Button
                aria-current={current ? "page" : undefined}
                key={version}
                onClick={() => onVersion(version)}
                size="xs"
                type="button"
                variant={current ? "secondary" : "ghost"}
              >
                v{version}
              </Button>
            );
          })}
        </nav>
        {title ? (
          <p className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
            {title}
          </p>
        ) : (
          <div className="flex-1" />
        )}
        <div className="ml-auto flex items-center gap-1">
          <MetaInfo meta={plaintext.meta} />
          <ThemeToggle />
        </div>
      </header>
      <iframe
        className="min-h-0 w-full flex-1 border-0 bg-background"
        sandbox=""
        srcDoc={plaintext.html}
        title={title ?? "Draft"}
      />
    </div>
  );
}

function OriginCopy({ origin }: { origin: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(origin);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  }, [origin]);

  return (
    <div className="flex items-center justify-center gap-1">
      <CardDescription className="font-mono">
        {truncateMiddle(origin)}
      </CardDescription>
      <Button
        aria-label={copied ? "Copied" : "Copy origin"}
        onClick={handleCopy}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

function MetaInfo({ meta }: { meta: DraftMeta }) {
  const rows = metaRows(meta);
  if (rows.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button aria-label="Draft info" size="icon" type="button" variant="ghost">
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Draft info</PopoverTitle>
          <PopoverDescription>From the decrypted envelope.</PopoverDescription>
        </PopoverHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          {rows.map((row) => (
            <div className="contents" key={row.label}>
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function metaRows(meta: DraftMeta): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (meta.description) {
    rows.push({ label: "Description", value: meta.description });
  }
  if (meta.createdAt) {
    const parsed = Date.parse(meta.createdAt);
    rows.push({
      label: "Created",
      value: Number.isNaN(parsed)
        ? meta.createdAt
        : new Date(parsed).toLocaleString(),
    });
  }
  const repo = [meta.repoHost, meta.repoOrg, meta.repoName]
    .filter(Boolean)
    .join("/");
  if (repo) {
    rows.push({ label: "Repo", value: repo });
  }
  if (meta.gitBranch) {
    rows.push({ label: "Branch", value: meta.gitBranch });
  }
  if (meta.gitCommitSha) {
    const shortSha = meta.gitCommitSha.slice(0, 7);
    const subject = meta.gitCommitSubject
      ? `${shortSha} — ${meta.gitCommitSubject}`
      : shortSha;
    rows.push({ label: "Commit", value: subject });
  }
  if (meta.gitDirty === true) {
    rows.push({ label: "Git", value: "working tree dirty" });
  }
  return rows;
}
