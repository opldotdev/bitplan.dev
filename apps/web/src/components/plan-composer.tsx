"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { TemplatePreview } from "@/components/template-preview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { registerWebMcpTool } from "@/components/webmcp-tools";
import {
  draftInputFromAgent,
  type PublishedDraft,
  prepareDraft,
  publishDraft,
} from "@/lib/draft-publish";
import type { DraftPlaintext } from "@/lib/envelope";
import { createInstantDraft } from "@/lib/instant-draft";
import { PLAN_APPEARANCES } from "@/lib/plan-appearance";
import {
  connectBrowserWalletClient,
  isWalletConnected,
  onWalletChange,
} from "@/lib/wallet";

const PLAN_PLACEHOLDER = `Outcome

Context

Constraints

Next steps`;

export function PlanComposer() {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const [prepared, setPrepared] = useState<DraftPlaintext>();
  const [published, setPublished] = useState<PublishedDraft>();
  const [publishing, setPublishing] = useState(false);
  const [repository, setRepository] = useState("");
  const [title, setTitle] = useState("");
  const [walletError, setWalletError] = useState("");
  const [connectingWallet, setConnectingWallet] = useState(false);
  const openWallet = useCallback(async () => {
    setAdvancedOpen(true);
    setConnectingWallet(true);
    setWalletError("");
    try {
      await connectBrowserWalletClient();
    } catch {
      setWalletError(
        "Could not connect. Unlock your BRC-100 wallet and retry. If this browser cannot reach it, open BitPlan in your wallet-enabled browser."
      );
    } finally {
      setConnectingWallet(false);
    }
  }, []);

  useEffect(
    () =>
      registerWebMcpTool({
        description:
          "Put a complete BitPlan draft into the review screen. This does not connect a wallet, spend funds, or publish; the user must review and publish it manually.",
        execute: (value) => {
          const input = draftInputFromAgent(value);
          const next = prepareDraft(input);
          setBody(input.body);
          setError(undefined);
          setPrepared(next);
          setRepository(input.repository);
          setTitle(input.title);
          return {
            publishRequiresUserAction: true,
            status: "ready-for-review",
            title: next.meta.title,
          };
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            body: {
              description: "The complete plan in plain text.",
              maxLength: 50_000,
              minLength: 1,
              type: "string",
            },
            repository: {
              description: "Optional HTTPS repository URL.",
              format: "uri",
              type: "string",
            },
            title: { maxLength: 160, minLength: 1, type: "string" },
          },
          required: ["body", "title"],
          type: "object",
        },
        name: "prepare_bitplan_plan",
        title: "Prepare a BitPlan",
      }),
    []
  );

  const review = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      try {
        setPrepared(prepareDraft({ body, repository, title }));
        setError(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Check the plan.");
      }
    },
    [body, repository, title]
  );

  const publish = useCallback(async () => {
    if (!prepared) {
      return;
    }
    setPublishing(true);
    setError(undefined);
    try {
      const wallet = await connectBrowserWalletClient();
      setPublished(await publishDraft(wallet, prepared));
      setPrepared(undefined);
    } catch {
      setError(
        "The wallet could not publish this plan. Unlock a compatible BRC-100 wallet and try again."
      );
    } finally {
      setPublishing(false);
    }
  }, [prepared]);

  const copyHandoff = useCallback(async () => {
    if (!published) {
      return;
    }
    const viewer = `https://bitplan.dev/d/${published.origin}`;
    const repo = repository.trim() ? `\nRepository: ${repository.trim()}` : "";
    try {
      await navigator.clipboard.writeText(
        `Use this BitPlan for the current project.\nPlan: ${viewer}${repo}\nFetch: npx bitplan fetch ${published.origin} --meta`
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [published, repository]);

  const edit = useCallback(() => {
    setPrepared(undefined);
    setAdvancedOpen(true);
  }, []);
  const updateBody = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setBody(event.target.value),
    []
  );
  const updateRepository = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setRepository(event.target.value),
    []
  );
  const updateTitle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value),
    []
  );

  if (published) {
    const viewer = `/d/${published.origin}`;
    return (
      <WalletFlowShell title="Published plan">
        <div className="space-y-2">
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            Published
          </h1>
          <p className="text-muted-foreground">
            Your plan is encrypted and permanent.
            {published.relayed
              ? " 1Sat accepted it for OrdFS."
              : " The viewer may take a moment to appear."}
          </p>
        </div>
        <p className="break-all rounded-lg bg-muted p-3 font-mono text-xs">
          {published.origin}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={viewer}>Open plan</Link>
          </Button>
          <Button onClick={copyHandoff} type="button" variant="outline">
            {copied ? "Copied" : "Copy agent handoff"}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/drafts">My drafts</Link>
          </Button>
        </div>
      </WalletFlowShell>
    );
  }

  if (prepared) {
    return (
      <WalletFlowShell title="Review your plan">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading font-semibold text-2xl tracking-tight">
              Review
            </h1>
            <p className="text-muted-foreground text-sm">
              This exact document will be encrypted and published.
            </p>
          </div>
          <Button
            disabled={publishing}
            onClick={edit}
            type="button"
            variant="ghost"
          >
            Edit
          </Button>
        </div>
        <iframe
          className="h-[60dvh] min-h-96 w-full rounded-xl border bg-background"
          sandbox=""
          srcDoc={prepared.html}
          title="Plan preview"
        />
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-xs">
            Wallet-only · encrypted · permanent
          </p>
          <Button disabled={publishing} onClick={publish} type="button">
            {publishing ? "Waiting for wallet..." : "Publish plan"}
          </Button>
        </div>
      </WalletFlowShell>
    );
  }

  if (!advancedOpen) {
    return (
      <SharedStarter
        onAdvanced={() => void openWallet()}
        setTitle={setTitle}
        title={title}
        updateTitle={updateTitle}
      />
    );
  }

  return (
    <WalletFlowShell connecting={connectingWallet} title="Use your wallet">
      <Button
        onClick={() => setAdvancedOpen(false)}
        type="button"
        variant="ghost"
      >
        Back to shared draft
      </Button>

      <div className="border-t pt-6">
        <h2 className="font-heading text-2xl">Wallet access</h2>
        {walletError ? (
          <>
            <p className="mt-3 text-muted-foreground text-sm" role="alert">
              {walletError}
            </p>
            <Button
              className="mt-3"
              disabled={connectingWallet}
              onClick={() => void openWallet()}
              type="button"
              variant="outline"
            >
              {connectingWallet ? "Connecting…" : "Reconnect wallet"}
            </Button>
          </>
        ) : null}
        <form className="mt-6 space-y-6" onSubmit={review}>
          <p className="text-muted-foreground text-sm">
            Only your wallet can open this plan. Review it before publishing.
          </p>
          <div className="space-y-2">
            <Label htmlFor="plan-title">Title</Label>
            <Input
              id="plan-title"
              maxLength={160}
              onChange={updateTitle}
              placeholder="Ship the account recovery flow"
              value={title}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-repository">Repository URL (optional)</Label>
            <Input
              id="plan-repository"
              inputMode="url"
              onChange={updateRepository}
              placeholder="https://github.com/owner/repository"
              type="url"
              value={repository}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-body">Plan</Label>
            <Textarea
              className="min-h-72 resize-y"
              id="plan-body"
              maxLength={50_000}
              onChange={updateBody}
              placeholder={PLAN_PLACEHOLDER}
              value={body}
            />
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit">Review plan</Button>
          </div>
        </form>
      </div>
    </WalletFlowShell>
  );
}

function WalletFlowShell({
  children,
  title,
  connecting = false,
}: {
  children: ReactNode;
  title: string;
  connecting?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const connected = useSyncExternalStore(
    onWalletChange,
    isWalletConnected,
    () => false
  );
  let walletLabel = "Wallet disconnected";
  let orbColor = "bg-muted-foreground";
  if (connecting) {
    walletLabel = "Connecting to wallet";
    orbColor = "bg-amber-500 motion-safe:animate-pulse";
  } else if (connected) {
    walletLabel = "Wallet connected";
    orbColor = "bg-emerald-500";
  }
  return (
    <>
      <TemplatePreview
        className="h-[calc(100dvh-3.5rem)] rounded-none blur-sm"
        dark={resolvedTheme === "dark"}
        fullSize
        preset={PLAN_APPEARANCES[0]}
      />
      <Dialog open>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto bg-background/95 p-6 motion-reduce:animate-none sm:max-w-2xl sm:p-10"
          fullScreenOnMobile={false}
          onInteractOutside={(event) => event.preventDefault()}
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <span
            aria-label={walletLabel}
            className="absolute top-4 right-4 flex size-6 items-center justify-center"
            role="status"
            title={walletLabel}
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${orbColor}`}
            />
            <span className="sr-only">{walletLabel}</span>
          </span>
          <DialogDescription className="sr-only">
            Wallet-controlled encryption and permanent publication. No
            transaction is sent until you review and approve publishing.
          </DialogDescription>
          {children}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SharedStarter({
  title,
  setTitle,
  updateTitle,
  onAdvanced,
}: {
  title: string;
  setTitle: (title: string) => void;
  updateTitle: (event: ChangeEvent<HTMLInputElement>) => void;
  onAdvanced: () => void;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const [starter, setStarter] = useState(PLAN_APPEARANCES[0]);
  const [step, setStep] = useState<"name" | "style">("name");
  const actionLabel = step === "name" ? "Continue" : "View shared draft";
  const createSharedDraft = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (creating || !title.trim()) {
        return;
      }
      if (step === "name") {
        setStep("style");
        return;
      }
      setCreating(true);
      setError(undefined);
      try {
        const viewer = await createInstantDraft({
          layout: starter.layout,
          title,
        });
        router.push(viewer);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The shared draft could not be created. Try again."
        );
        setCreating(false);
      }
    },
    [creating, router, starter.layout, step, title]
  );

  return (
    <>
      <TemplatePreview
        className="h-[calc(100dvh-3.5rem)] rounded-none blur-sm"
        dark={resolvedTheme === "dark"}
        fullSize
        preset={starter}
      />
      <Dialog
        onOpenChange={(open) => {
          if (!(open || creating)) {
            router.push("/");
          }
        }}
        open
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto bg-background/95 p-6 motion-reduce:animate-none sm:max-w-lg sm:p-10"
          fullScreenOnMobile={false}
          onEscapeKeyDown={(event) => {
            if (creating) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => event.preventDefault()}
          showCloseButton={false}
        >
          <form
            aria-busy={creating}
            className="space-y-6"
            key={step}
            onSubmit={createSharedDraft}
          >
            <div className="motion-safe:fade-in motion-safe:slide-in-from-bottom-2 space-y-3 motion-safe:animate-in motion-safe:duration-300">
              <DialogTitle className="font-heading text-3xl leading-tight sm:text-4xl">
                {step === "name"
                  ? "Name your plan."
                  : "Choose a starting point."}
              </DialogTitle>
              <DialogDescription
                className={step === "name" ? "sr-only" : undefined}
              >
                {step === "name"
                  ? "Choose a name or skip. You can rename it later."
                  : `A style for ${title.trim()}. You can change it later.`}
              </DialogDescription>
            </div>
            {step === "name" ? (
              <>
                <Label className="sr-only" htmlFor="shared-draft-title">
                  Document name
                </Label>
                <Input
                  autoComplete="off"
                  autoFocus
                  className="motion-safe:fade-in motion-safe:slide-in-from-bottom-2 h-14 rounded-none border-0 border-b bg-transparent px-0 text-xl shadow-none transition-colors duration-200 focus-visible:border-foreground focus-visible:ring-0 motion-safe:animate-in motion-safe:fill-mode-both motion-safe:duration-300 motion-reduce:transition-none md:text-2xl dark:bg-transparent motion-safe:[animation-delay:80ms]"
                  disabled={creating}
                  id="shared-draft-title"
                  maxLength={160}
                  onChange={updateTitle}
                  placeholder="Plan name"
                  required
                  value={title}
                />
              </>
            ) : (
              <fieldset className="grid grid-cols-3 gap-2" disabled={creating}>
                <legend className="sr-only">Template</legend>
                {PLAN_APPEARANCES.map((preset, index) => (
                  <label className="min-w-0 cursor-pointer" key={preset.layout}>
                    <input
                      autoFocus={index === 0}
                      checked={starter.layout === preset.layout}
                      className="peer sr-only"
                      name="template"
                      onChange={() => setStarter(preset)}
                      type="radio"
                      value={preset.layout}
                    />
                    <span className="block overflow-hidden rounded-lg border p-1 peer-checked:border-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring motion-safe:transition-colors">
                      <TemplatePreview
                        className="h-32 sm:h-40"
                        dark={resolvedTheme === "dark"}
                        preset={preset}
                      />
                      <span className="block py-2 text-center text-sm">
                        {preset.name}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <div className="motion-safe:fade-in motion-safe:slide-in-from-bottom-2 flex flex-wrap items-center gap-3 motion-safe:animate-in motion-safe:fill-mode-both motion-safe:duration-300 motion-safe:[animation-delay:160ms]">
              <Button
                className="group motion-safe:transition-transform motion-safe:active:scale-[0.98]"
                disabled={creating || !title.trim()}
                size="lg"
                type="submit"
              >
                {creating ? (
                  <Spinner className="motion-reduce:animate-none" />
                ) : (
                  <ArrowRight className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
                )}
                {creating ? "Opening your draft…" : actionLabel}
              </Button>
              {step === "name" ? (
                <Button
                  onClick={() => {
                    setTitle("Master Plan");
                    setStep("style");
                  }}
                  type="button"
                  variant="ghost"
                >
                  Skip
                </Button>
              ) : null}
            </div>
            {step === "style" ? (
              <Button
                disabled={creating}
                onClick={() => {
                  setStep("name");
                  setError(undefined);
                }}
                type="button"
                variant="ghost"
              >
                Back
              </Button>
            ) : null}
            {step === "style" ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                Anyone with the full link can read and contribute. Keep it
                private.
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <Button
                disabled={creating}
                onClick={onAdvanced}
                size="sm"
                type="button"
                variant="link"
              >
                Use wallet
              </Button>
              <Button
                disabled={creating}
                onClick={() => router.push("/")}
                size="sm"
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
