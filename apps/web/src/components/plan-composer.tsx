"use client";

import { Check, LockKeyhole } from "lucide-react";
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
import { PLAN_APPEARANCES, type PlanAppearance } from "@/lib/plan-appearance";
import { connectBrowserWalletClient } from "@/lib/wallet";

const PLAN_PLACEHOLDER = `Outcome

Context

Constraints

Next steps`;

const STARTER_DESCRIPTIONS: Record<PlanAppearance["layout"], string> = {
  blank: "A quiet page for a plan from scratch.",
  brief: "A warm brief with room for context and decisions.",
  terminal: "A focused technical walkthrough.",
};

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
  const [starter, setStarter] = useState(PLAN_APPEARANCES[0]);
  const [title, setTitle] = useState("Untitled plan");

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
      if (creating) {
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
      <section className="space-y-6">
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
      <section className="space-y-5">
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

  return (
    <section className="space-y-8">
      <form className="space-y-6" onSubmit={createSharedDraft}>
        <div className="space-y-2">
          <p className="font-medium text-primary text-sm">New shared draft</p>
          <h1 className="font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            Start with a page you like.
          </h1>
          <p className="max-w-xl text-muted-foreground">
            Name it, choose a starting point, and share the link. No account or
            wallet needed.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="shared-draft-title">Draft name</Label>
          <Input
            autoFocus
            className="h-12 text-base"
            id="shared-draft-title"
            maxLength={160}
            onChange={updateTitle}
            placeholder="Launch plan"
            value={title}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="font-medium text-sm">Choose a page</legend>
          <div className="-mx-1 grid snap-x snap-mandatory auto-cols-[82%] grid-flow-col gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
            {PLAN_APPEARANCES.map((preset) => {
              const selected = starter.layout === preset.layout;
              return (
                <button
                  aria-pressed={selected}
                  className="group relative snap-start overflow-hidden rounded-xl border bg-background p-1.5 text-left outline-none transition-colors hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground"
                  key={preset.layout}
                  onClick={() => setStarter(preset)}
                  type="button"
                >
                  <TemplatePreview
                    className="h-32 sm:h-36"
                    dark={resolvedTheme === "dark"}
                    preset={preset}
                  />
                  {selected ? (
                    <Check
                      aria-hidden="true"
                      className="absolute top-3 right-3 size-5 rounded-full bg-foreground p-1 text-background"
                    />
                  ) : null}
                  <span className="block px-2 pt-2 font-medium text-sm">
                    {preset.name}
                  </span>
                  <span className="block min-h-12 px-2 pt-1 pb-2 text-muted-foreground text-xs leading-relaxed">
                    {STARTER_DESCRIPTIONS[preset.layout]}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="space-y-3">
          <Button className="w-full sm:w-auto" disabled={creating} size="lg">
            {creating ? <Spinner data-icon="inline-start" /> : null}
            {creating ? "Creating encrypted draft..." : "Create shared draft"}
          </Button>
          <p className="flex max-w-xl items-start gap-2 text-muted-foreground text-xs leading-relaxed">
            <LockKeyhole
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            This disposable working draft belongs to its private link, not a
            wallet. Anyone with the full link can read and edit it, so share it
            with people you trust. Use a wallet when you are ready to publish a
            separate permanent version.
          </p>
        </div>
      </form>

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
