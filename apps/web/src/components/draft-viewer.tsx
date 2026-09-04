"use client";

import { Check, Cloud, Copy, Info, Lock } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import { Spinner } from "@/components/ui/spinner";
import { type DraftsWallet, walletOwnsDraft } from "@/lib/drafts";
import type { DraftMeta, DraftPlaintext, EnvelopeWallet } from "@/lib/envelope";
import { EnvelopeAccessError, openEnvelope } from "@/lib/envelope";
import { formatByteSize, truncateMiddle } from "@/lib/format";
import { isHostedId } from "@/lib/hosted-id";
import { linkWallet, parseLinkFragment } from "@/lib/link-reader";
import {
  fetchOrdfsContent,
  type OrdfsContent,
  type OrdfsContentResult,
} from "@/lib/ordfs";
import { normalizeOrigin } from "@/lib/outpoint";
import { withRenderPolicy } from "@/lib/render-policy";
import {
  clampVersion,
  parseVersionQuery,
  seqToVersion,
  versionToSeq,
} from "@/lib/version";
import {
  connectBrowserWallet,
  getConnectedWallet,
  isWalletAvailable,
  reconnectAuthenticatedWallet,
} from "@/lib/wallet";

type WalletIssue =
  | "connect-failed"
  | "wallet-unreachable"
  | "decrypt-refused"
  | "identity-unavailable"
  | "not-authorized";

export interface LoadedDraft {
  content: OrdfsContent;
  currentVersion: number;
  latestOutpoint: string | null;
  latestVersion: number;
  origin: string;
}

export function DraftResolving() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ViewerHeader />
      <div className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col items-center justify-center gap-3 px-6 py-10">
        <Spinner className="size-6" />
        <p className="text-muted-foreground text-sm">Opening draft…</p>
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
      linkIssue: WalletIssue | null;
      walletIssue: WalletIssue | null;
    }
  | {
      phase: "decrypted";
      requestKey: string;
      draft: LoadedDraft;
      canPublish: boolean;
      openedWithLink?: boolean;
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

export function viewerDocumentTitle(
  title: string | null | undefined,
  genericTitle: string
): string {
  const trimmedTitle = title?.trim();
  return trimmedTitle ? `${trimmedTitle} · BitPlan` : genericTitle;
}

export function viewerVersionHref(
  origin: string,
  version: number,
  latestVersion: number,
  fragment = ""
): string {
  const query = version === latestVersion ? "" : `?v=${version}`;
  return `/d/${origin}${query}${fragment}`;
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
    draft: {
      content,
      currentVersion,
      latestOutpoint: latest.outpoint,
      latestVersion,
      origin,
    },
    state: "found",
  };
}

function hasListOutputs(wallet: EnvelopeWallet): wallet is DraftsWallet {
  return "listOutputs" in wallet && typeof wallet.listOutputs === "function";
}

async function decryptDraft(
  wallet: EnvelopeWallet,
  draft: LoadedDraft
): Promise<{
  plaintext: DraftPlaintext | null;
  issue: WalletIssue | null;
}> {
  try {
    const opened = await openEnvelope(wallet, draft.content.bytes);
    return { issue: null, plaintext: opened.plaintext };
  } catch (error) {
    return { issue: accessIssue(error), plaintext: null };
  }
}

/** Re-open a draft after resolve. Link wallets never call canPublishDraft. */
async function reopenDraft(
  wallet: EnvelopeWallet,
  draft: LoadedDraft
): Promise<{
  canPublish: boolean;
  plaintext: DraftPlaintext | null;
  issue: WalletIssue | null;
}> {
  const opened = await decryptDraft(wallet, draft);
  if (!opened.plaintext) {
    return { canPublish: false, issue: opened.issue, plaintext: null };
  }
  if (!hasListOutputs(wallet) || isHostedId(draft.origin)) {
    return { canPublish: false, issue: null, plaintext: opened.plaintext };
  }
  const canPublish = await canPublishDraft(wallet, draft);
  return { canPublish, issue: null, plaintext: opened.plaintext };
}

function accessIssue(error: unknown): WalletIssue {
  return error instanceof EnvelopeAccessError ? error.issue : "decrypt-refused";
}

function walletIssueMessage(issue: WalletIssue): string {
  switch (issue) {
    case "connect-failed":
      return "Could not connect to or authorize a BRC-100 wallet.";
    case "wallet-unreachable":
      return "No wallet answered. This browser may block pages from reaching wallets on this machine, which the embedded browser in some desktop apps does. Open this link in a regular browser with your BRC-100 wallet running.";
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

async function walletForDecrypt(): Promise<DraftsWallet | null> {
  return getConnectedWallet() ?? (await reconnectAuthenticatedWallet());
}

async function canPublishDraft(
  wallet: DraftsWallet,
  draft: LoadedDraft
): Promise<boolean> {
  if (isHostedId(draft.origin)) {
    return false;
  }
  try {
    return await walletOwnsDraft(wallet, draft.origin, draft.latestOutpoint);
  } catch {
    return false;
  }
}

async function viewForFoundDraft(
  draft: LoadedDraft,
  requestKey: string,
  existingWallet: DraftsWallet | null
): Promise<{
  view: Extract<ViewerState, { phase: "decrypted" | "encrypted" }>;
  wallet: DraftsWallet | null;
}> {
  const secret =
    typeof window === "undefined"
      ? null
      : parseLinkFragment(window.location.hash);
  let linkIssue: WalletIssue | null = null;
  if (secret) {
    const linked = await reopenDraft(linkWallet(secret), draft);
    if (linked.plaintext) {
      return {
        view: {
          canPublish: false,
          draft,
          openedWithLink: true,
          phase: "decrypted",
          plaintext: linked.plaintext,
          requestKey,
        },
        wallet: existingWallet,
      };
    }
    linkIssue = linked.issue;
  }

  const wallet = existingWallet ?? (await walletForDecrypt());
  if (!wallet) {
    return {
      view: {
        draft,
        linkIssue,
        phase: "encrypted",
        requestKey,
        walletIssue: null,
      },
      wallet: null,
    };
  }

  const reopened = await reopenDraft(wallet, draft);
  if (reopened.plaintext) {
    return {
      view: {
        canPublish: reopened.canPublish,
        draft,
        phase: "decrypted",
        plaintext: reopened.plaintext,
        requestKey,
      },
      wallet,
    };
  }
  return {
    view: {
      draft,
      linkIssue,
      phase: "encrypted",
      requestKey,
      walletIssue: reopened.issue,
    },
    wallet,
  };
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

  const walletRef = useRef<DraftsWallet | null>(null);

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

      const opened = await viewForFoundDraft(
        result.draft,
        requestKey,
        walletRef.current
      );
      if (cancelled) {
        return;
      }
      if (opened.wallet) {
        walletRef.current = opened.wallet;
      }
      setView(opened.view);
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
          ? {
              ...current,
              walletIssue: isWalletAvailable()
                ? "connect-failed"
                : "wallet-unreachable",
            }
          : current
      );
      setBusy(false);
      return;
    }

    try {
      const reopened = await reopenDraft(walletRef.current, draft);
      setView((current) => {
        if (
          current.requestKey !== requestKey ||
          current.phase !== "encrypted"
        ) {
          return current;
        }
        if (!reopened.plaintext) {
          return { ...current, walletIssue: reopened.issue };
        }
        return {
          canPublish: reopened.canPublish,
          draft,
          phase: "decrypted",
          plaintext: reopened.plaintext,
          requestKey,
        };
      });
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
      const fragment = view.openedWithLink ? window.location.hash : "";
      router.replace(
        viewerVersionHref(
          view.draft.origin,
          version,
          view.draft.latestVersion,
          fragment
        ),
        { scroll: false }
      );
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
        canPublish={view.canPublish}
        currentVersion={view.draft.currentVersion}
        latestVersion={view.draft.latestVersion}
        onVersion={handleVersion}
        openedWithLink={view.openedWithLink}
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
      linkIssue={view.linkIssue}
      onConnect={handleConnect}
      origin={view.draft.origin}
      walletIssue={view.walletIssue}
    />
  );
}

function ViewerHeader({ origin }: { origin?: string }) {
  return (
    <header className="mx-auto flex w-full max-w-[42rem] items-center justify-between px-6 py-6">
      <Wordmark />
      {origin && isHostedId(origin) ? <HostedLabel /> : null}
      <ThemeToggle />
    </header>
  );
}

function HostedLabel() {
  return (
    <span
      className="inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground"
      title="Hosted draft"
    >
      <Cloud aria-hidden className="size-4" />
      <span className="sr-only">Hosted draft</span>
    </span>
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
      <ViewerHeader origin={problem.origin} />
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
  linkIssue,
  walletIssue,
  busy,
  onConnect,
}: {
  origin: string;
  content: OrdfsContent;
  currentVersion: number;
  latestVersion: number;
  linkIssue: WalletIssue | null;
  walletIssue: WalletIssue | null;
  busy: boolean;
  onConnect: () => void;
}) {
  const isLatest = currentVersion === latestVersion;
  const versionLabel = isLatest
    ? `v${currentVersion} · latest`
    : `v${currentVersion} of ${latestVersion}`;
  const connectFailed =
    walletIssue === "connect-failed" || walletIssue === "wallet-unreachable";
  const needsConnect = walletIssue === null || connectFailed;
  let connectLabel = "Connect wallet";
  if (busy) {
    connectLabel = "Connecting…";
  } else if (connectFailed) {
    connectLabel = "Try again";
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <ViewerHeader origin={origin} />
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
              {linkIssue === "not-authorized" ? (
                <p className="text-center text-muted-foreground text-sm">
                  This link does not open this version. A wallet that is a
                  reader can still open it.
                </p>
              ) : null}
              {needsConnect ? (
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={onConnect}
                  type="button"
                >
                  {busy ? <Spinner data-icon="inline-start" /> : null}
                  {connectLabel}
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={onConnect}
                  type="button"
                  variant="outline"
                >
                  {busy ? <Spinner data-icon="inline-start" /> : null}
                  Try again
                </Button>
              )}
              {walletIssue ? (
                <p className="text-center text-destructive text-sm">
                  {walletIssueMessage(walletIssue)}
                </p>
              ) : null}
              <p className="text-center text-muted-foreground text-sm">
                {isHostedId(origin)
                  ? "Only an authorized wallet or reader link can open it. bitplan.dev stores the encrypted draft and cannot read it."
                  : "Only an authorized wallet can read it. bitplan.dev stores no draft or plaintext server-side."}
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function DecryptedView({
  canPublish,
  openedWithLink,
  plaintext,
  currentVersion,
  latestVersion,
  onVersion,
  origin,
}: {
  canPublish: boolean;
  openedWithLink?: boolean;
  plaintext: DraftPlaintext;
  currentVersion: number;
  latestVersion: number;
  onVersion: (version: number) => void;
  origin: string;
}) {
  const { title } = plaintext.meta;
  const versions = Array.from({ length: latestVersion }, (_, i) => i + 1);

  useEffect(() => {
    const genericTitle = document.title;
    document.title = viewerDocumentTitle(title, genericTitle);
    return () => {
      document.title = genericTitle;
    };
  }, [title]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-border border-b px-4 py-2">
        <Wordmark />
        {isHostedId(origin) ? <HostedLabel /> : null}
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
          <DecryptedShare
            canPublish={canPublish}
            openedWithLink={openedWithLink}
            origin={origin}
          />
          <MetaInfo meta={plaintext.meta} />
          <ThemeToggle />
        </div>
      </header>
      <iframe
        allow="clipboard-write"
        className="min-h-0 w-full flex-1 border-0 bg-background"
        sandbox="allow-scripts"
        srcDoc={withRenderPolicy(plaintext.html)}
        title={title ?? "Draft"}
      />
    </div>
  );
}

function DecryptedShare({
  canPublish,
  openedWithLink,
  origin,
}: {
  canPublish: boolean;
  openedWithLink?: boolean;
  origin: string;
}) {
  if (openedWithLink) {
    return <ReaderLinkCopy />;
  }
  if (canPublish) {
    return <ShareDraftDialog origin={origin} />;
  }
  return null;
}

function ReaderLinkCopy() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
      toast.error("Could not copy the reader link");
    }
  }, []);

  return (
    <Button onClick={handleCopy} size="sm" type="button" variant="ghost">
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy link"}
    </Button>
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
    {
      label: meta.cliVersion === "web" ? "Created by" : "CLI",
      value: meta.cliVersion === "web" ? "bitplan.dev" : meta.cliVersion,
    },
    { label: "File SHA-256", value: meta.fileSha256 },
  ];
}
