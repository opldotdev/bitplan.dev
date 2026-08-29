"use client";

import { Check, Copy, Info, Lock } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ShareDraftDialog } from "@/components/share-draft-dialog";
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
import { EnvelopeAccessError, openEnvelope } from "@/lib/envelope";
import { formatByteSize, truncateMiddle } from "@/lib/format";
import {
  fetchOrdfsContent,
  type OrdfsContent,
  type OrdfsContentResult,
} from "@/lib/ordfs";
import { normalizeOrigin } from "@/lib/outpoint";
import {
  clampVersion,
  parseVersionQuery,
  seqToVersion,
  versionToSeq,
} from "@/lib/version";
import {
  connectBrowserWallet,
  getConnectedWallet,
  reconnectAuthenticatedWallet,
} from "@/lib/wallet";

type WalletIssue =
  | "connect-failed"
  | "decrypt-refused"
  | "identity-unavailable"
  | "not-authorized";

export interface LoadedDraft {
  content: OrdfsContent;
  currentVersion: number;
  latestVersion: number;
  origin: string;
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

export type ResolveResult =
  | { state: "invalid-origin"; origin: string }
  | { state: "not-found"; origin: string }
  | {
      state: "unavailable";
      origin: string;
      reason: "network" | "server" | "request";
      status?: number;
    }
  | {
      state: "invalid-content";
      origin: string;
      reason: "content-type" | "envelope";
      contentType: string;
    }
  | { state: "found"; draft: LoadedDraft };

export type ViewerState =
  | { phase: "resolving"; requestKey: string }
  | {
      phase: "problem";
      requestKey: string;
      problem: Exclude<ResolveResult, { state: "found" }>;
    }
  | {
      phase: "encrypted";
      requestKey: string;
      draft: LoadedDraft;
      walletIssue: WalletIssue | null;
    }
  | {
      phase: "decrypted";
      requestKey: string;
      draft: LoadedDraft;
      plaintext: DraftPlaintext;
    };

/** A route may only render async state produced for that exact route/version. */
export function isViewerStateCurrent(
  state: ViewerState,
  requestKey: string
): boolean {
  return state.requestKey === requestKey;
}

export function viewerRequestKey(
  originParam: string,
  requestedVersion: number | null
): string {
  return `${originParam}:${requestedVersion ?? "latest"}`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled state: ${String(value)}`);
}

function toResolveFailure(
  result: Exclude<OrdfsContentResult, { state: "found" }>,
  origin: string
): Exclude<ResolveResult, { state: "found" }> {
  switch (result.state) {
    case "not-found":
      return { origin, state: "not-found" };
    case "network-error":
      return { origin, reason: "network", state: "unavailable" };
    case "server-error":
      return {
        origin,
        reason: "server",
        state: "unavailable",
        status: result.status,
      };
    case "request-error":
      return {
        origin,
        reason: "request",
        state: "unavailable",
        status: result.status,
      };
    case "invalid-content":
      return {
        contentType: result.contentType,
        origin,
        reason: result.reason,
        state: "invalid-content",
      };
    default:
      return assertNever(result);
  }
}

/** Resolve origin + requested version to the envelope bytes to display. */
export async function resolveDraft(
  originParam: string,
  requestedVersion: number | null
): Promise<ResolveResult> {
  const origin = normalizeOrigin(originParam);
  if (!origin) {
    return { origin: originParam, state: "invalid-origin" };
  }

  const latestResult = await fetchOrdfsContent(origin, -1);
  if (latestResult.state !== "found") {
    return toResolveFailure(latestResult, origin);
  }
  const { content: latest } = latestResult;

  const latestVersion = seqToVersion(latest.sequence ?? 0);
  const currentVersion = clampVersion(
    requestedVersion ?? latestVersion,
    latestVersion
  );

  let content = latest;
  if (currentVersion !== latestVersion) {
    const pinnedResult = await fetchOrdfsContent(
      origin,
      versionToSeq(currentVersion)
    );
    if (pinnedResult.state !== "found") {
      return toResolveFailure(pinnedResult, origin);
    }
    ({ content } = pinnedResult);
  }

  return {
    draft: { content, currentVersion, latestVersion, origin },
    state: "found",
  };
}

/** Re-open a draft with an already-connected wallet after a version switch. */
async function reopenDraft(
  wallet: EnvelopeWallet,
  bytes: Uint8Array
): Promise<{ plaintext: DraftPlaintext | null; issue: WalletIssue | null }> {
  try {
    const opened = await openEnvelope(wallet, bytes);
    return { issue: null, plaintext: opened.plaintext };
  } catch (error) {
    return { issue: accessIssue(error), plaintext: null };
  }
}

function accessIssue(error: unknown): WalletIssue {
  return error instanceof EnvelopeAccessError ? error.issue : "decrypt-refused";
}

function walletIssueMessage(issue: WalletIssue): string {
  switch (issue) {
    case "connect-failed":
      return "Could not connect to or authorize a BRC-100 wallet.";
    case "not-authorized":
      return "This wallet identity is not authorized for this version.";
    case "identity-unavailable":
      return "The wallet could not provide its identity key.";
    case "decrypt-refused":
      return "The wallet declined to decrypt this version.";
    default:
      return assertNever(issue);
  }
}

async function walletForDecrypt(): Promise<EnvelopeWallet | null> {
  return getConnectedWallet() ?? (await reconnectAuthenticatedWallet());
}

function VersionPill({
  version,
  current,
  onVersion,
}: {
  version: number;
  current: boolean;
  onVersion: (version: number) => void;
}) {
  const handleClick = useCallback(
    () => onVersion(version),
    [onVersion, version]
  );
  return (
    <Button
      aria-current={current ? "page" : undefined}
      onClick={handleClick}
      size="xs"
      type="button"
      variant={current ? "secondary" : "ghost"}
    >
      v{version}
    </Button>
  );
}

export function DraftViewer() {
  const params = useParams<{ origin: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const originParam = params.origin ?? "";
  const requestedVersion = parseVersionQuery(searchParams.get("v"));
  const requestKey = viewerRequestKey(originParam, requestedVersion);

  const [view, setView] = useState<ViewerState>({
    phase: "resolving",
    requestKey,
  });
  const [busy, setBusy] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const walletRef = useRef<EnvelopeWallet | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setBusy(false);
      setView({ phase: "resolving", requestKey });

      const result = await resolveDraft(originParam, requestedVersion);
      if (cancelled) {
        return;
      }

      if (result.state !== "found") {
        setView({ phase: "problem", problem: result, requestKey });
        return;
      }

      setView({
        draft: result.draft,
        phase: "encrypted",
        requestKey,
        walletIssue: null,
      });

      const wallet = walletRef.current ?? (await walletForDecrypt());
      if (cancelled) {
        return;
      }
      if (!wallet) {
        return;
      }

      walletRef.current = wallet;
      const reopened = await reopenDraft(wallet, result.draft.content.bytes);
      if (cancelled) {
        return;
      }
      if (reopened.plaintext) {
        setView({
          draft: result.draft,
          phase: "decrypted",
          plaintext: reopened.plaintext,
          requestKey,
        });
        return;
      }
      setView({
        draft: result.draft,
        phase: "encrypted",
        requestKey,
        walletIssue: reopened.issue,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [originParam, requestedVersion, requestKey, retryCount]);

  const handleConnect = useCallback(async () => {
    if (view.phase !== "encrypted" || busy) {
      return;
    }
    const { draft } = view;
    setBusy(true);
    setView({ ...view, walletIssue: null });

    try {
      walletRef.current = walletRef.current ?? (await connectBrowserWallet());
    } catch {
      setView((current) =>
        current.requestKey === requestKey && current.phase === "encrypted"
          ? { ...current, walletIssue: "connect-failed" }
          : current
      );
      setBusy(false);
      return;
    }

    try {
      const opened = await openEnvelope(walletRef.current, draft.content.bytes);
      setView((current) =>
        current.requestKey === requestKey && current.phase === "encrypted"
          ? {
              draft,
              phase: "decrypted",
              plaintext: opened.plaintext,
              requestKey,
            }
          : current
      );
    } catch (error) {
      setView((current) =>
        current.requestKey === requestKey && current.phase === "encrypted"
          ? { ...current, walletIssue: accessIssue(error) }
          : current
      );
    } finally {
      setBusy(false);
    }
  }, [busy, requestKey, view]);

  const handleRetry = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  const handleVersion = useCallback(
    (version: number) => {
      if (view.phase !== "decrypted" || version === view.draft.currentVersion) {
        return;
      }
      const query = version === view.draft.latestVersion ? "" : `?v=${version}`;
      router.replace(`/d/${view.draft.origin}${query}`, { scroll: false });
    },
    [router, view]
  );

  if (!isViewerStateCurrent(view, requestKey) || view.phase === "resolving") {
    return <DraftResolving />;
  }

  if (view.phase === "problem") {
    return <DraftProblemView onRetry={handleRetry} problem={view.problem} />;
  }

  if (view.phase === "decrypted") {
    return (
      <DecryptedView
        currentVersion={view.draft.currentVersion}
        latestVersion={view.draft.latestVersion}
        onVersion={handleVersion}
        origin={view.draft.origin}
        plaintext={view.plaintext}
      />
    );
  }

  return (
    <EncryptedView
      busy={busy}
      content={view.draft.content}
      currentVersion={view.draft.currentVersion}
      latestVersion={view.draft.latestVersion}
      onConnect={handleConnect}
      origin={view.draft.origin}
      walletIssue={view.walletIssue}
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

function DraftProblemView({
  problem,
  onRetry,
}: {
  problem: Exclude<ResolveResult, { state: "found" }>;
  onRetry: () => void;
}) {
  let title: string;
  let description: string;
  let retryable = false;

  switch (problem.state) {
    case "invalid-origin":
      title = "Invalid draft link.";
      description = "This URL does not contain a valid draft origin.";
      break;
    case "not-found":
      title = "No draft at this origin.";
      description = "OrdFS has no inscription for this draft origin.";
      break;
    case "invalid-content":
      title = "This inscription is not a BitPlan draft.";
      description =
        problem.reason === "content-type"
          ? `Expected application/x-bitplan, received ${problem.contentType}.`
          : "The inscription has the BitPlan content type but its envelope is malformed.";
      break;
    case "unavailable":
      retryable = true;
      if (problem.reason === "network") {
        title = "Could not reach OrdFS.";
        description =
          "Check your connection, then try loading the draft again.";
      } else if (problem.reason === "server") {
        title = "OrdFS is temporarily unavailable.";
        description = `The gateway returned status ${problem.status ?? 500}. Try again shortly.`;
      } else {
        title = "OrdFS rejected this request.";
        description = `The gateway returned status ${problem.status ?? "unknown"}.`;
      }
      break;
    default:
      return assertNever(problem);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <ViewerHeader />
      <main className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col justify-center px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="break-all font-mono text-muted-foreground text-xs">
              {problem.origin}
            </p>
            {retryable ? (
              <Button onClick={onRetry} type="button" variant="outline">
                Try again
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
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
            <Lock aria-hidden className="size-6 text-muted-foreground" />
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
                  {walletIssueMessage(walletIssue)}
                </p>
              ) : null}
              <p className="text-center text-muted-foreground text-sm">
                Only an authorized wallet can read it. bitplan.dev stores no
                draft or plaintext server-side.
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
  origin,
}: {
  plaintext: DraftPlaintext;
  currentVersion: number;
  latestVersion: number;
  onVersion: (version: number) => void;
  origin: string;
}) {
  const { title } = plaintext.meta;
  const versions = Array.from({ length: latestVersion }, (_, i) => i + 1);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-border border-b px-4 py-2">
        <Wordmark />
        <div className="flex flex-wrap gap-1">
          {versions.map((version) => (
            <VersionPill
              current={version === currentVersion}
              key={version}
              onVersion={onVersion}
              version={version}
            />
          ))}
        </div>
        {title ? (
          <p className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
            {title}
          </p>
        ) : (
          <div className="flex-1" />
        )}
        <div className="ml-auto flex items-center gap-1">
          <ShareDraftDialog origin={origin} />
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
        <Button
          aria-label="Draft info"
          size="icon"
          type="button"
          variant="ghost"
        >
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

export function metaRows(meta: DraftMeta): { label: string; value: string }[] {
  const parsedDate = Date.parse(meta.createdAt);
  const repo = [meta.repoHost, meta.repoOrg, meta.repoName]
    .filter(Boolean)
    .join("/");
  let gitStatus = "Unknown";
  if (meta.gitDirty !== null) {
    gitStatus = meta.gitDirty ? "Dirty" : "Clean";
  }
  return [
    { label: "Title", value: meta.title ?? "Untitled" },
    { label: "Description", value: meta.description ?? "None" },
    {
      label: "Created",
      value: Number.isNaN(parsedDate)
        ? meta.createdAt
        : new Date(parsedDate).toLocaleString(),
    },
    { label: "Repository", value: repo || "None" },
    { label: "Branch", value: meta.gitBranch ?? "None" },
    { label: "Commit", value: meta.gitCommitSha ?? "None" },
    { label: "Commit message", value: meta.gitCommitSubject ?? "None" },
    { label: "Working tree", value: gitStatus },
    { label: "CLI", value: meta.cliVersion },
    { label: "File SHA-256", value: meta.fileSha256 },
  ];
}
