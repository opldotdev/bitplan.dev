"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useState,
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
import { connectBrowserWalletClient } from "@/lib/wallet";

const PLAN_PLACEHOLDER = `Outcome

Context

Constraints

Next steps`;

export function PlanComposer() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const [prepared, setPrepared] = useState<DraftPlaintext>();
  const [published, setPublished] = useState<PublishedDraft>();
  const [publishing, setPublishing] = useState(false);
  const [repository, setRepository] = useState("");
  const [starter] = PLAN_APPEARANCES;
  const [title, setTitle] = useState("");

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

  const createSharedDraft = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (creating || !title.trim()) {
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
    [creating, router, starter.layout, title]
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
      <section className="mx-auto w-full max-w-[42rem] space-y-6 px-6 py-10">
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
      </section>
    );
  }

  if (prepared) {
    return (
      <section className="mx-auto w-full max-w-[42rem] space-y-5 px-6 py-10">
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
      </section>
    );
  }

  if (!advancedOpen) {
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
            className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto bg-background/95 p-6 sm:max-w-lg sm:p-10"
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
              onSubmit={createSharedDraft}
            >
              <div className="space-y-3">
                <DialogTitle className="font-heading text-3xl leading-tight sm:text-4xl">
                  Name your document.
                </DialogTitle>
                <DialogDescription>
                  Start with a name. You can shape the page together.
                </DialogDescription>
              </div>
              <Label className="sr-only" htmlFor="shared-draft-title">
                Document name
              </Label>
              <Input
                autoComplete="off"
                autoFocus
                className="h-14 rounded-none border-0 border-b bg-transparent px-0 text-xl shadow-none focus-visible:ring-0 md:text-2xl dark:bg-transparent"
                disabled={creating}
                id="shared-draft-title"
                maxLength={160}
                onChange={updateTitle}
                placeholder="What are you working on?"
                required
                value={title}
              />
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={creating || !title.trim()}
                  size="lg"
                  type="submit"
                >
                  {creating ? <Spinner /> : <ArrowRight />}
                  {creating ? "Opening your draft…" : "View shared draft"}
                </Button>
                <span className="text-muted-foreground text-xs">
                  press Enter
                </span>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                No wallet needed. Anyone with the full private link can read and
                contribute. This working draft is link-owned; permanent
                publishing uses a wallet.
              </p>
              <div className="flex items-center justify-between gap-3">
                <Button
                  disabled={creating}
                  onClick={() => setAdvancedOpen(true)}
                  size="sm"
                  type="button"
                  variant="link"
                >
                  Use a wallet instead
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

  return (
    <section className="mx-auto w-full max-w-[42rem] space-y-8 px-6 py-10">
      <Button
        onClick={() => setAdvancedOpen(false)}
        type="button"
        variant="ghost"
      >
        Back to shared draft
      </Button>

      <details
        className="border-t pt-6"
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        open={advancedOpen}
      >
        <summary className="cursor-pointer text-muted-foreground text-sm">
          Publish permanently with a wallet
        </summary>
        <form className="mt-6 space-y-6" onSubmit={review}>
          <p className="text-muted-foreground text-sm">
            Compose a text plan for encrypted on-chain publishing through a
            BRC-100 wallet.
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
      </details>
    </section>
  );
}
