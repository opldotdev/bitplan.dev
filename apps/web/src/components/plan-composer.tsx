"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { registerWebMcpTool } from "@/components/webmcp-tools";
import {
  draftInputFromAgent,
  type PublishedDraft,
  prepareDraft,
  publishDraft,
} from "@/lib/draft-publish";
import type { DraftPlaintext } from "@/lib/envelope";
import { connectBrowserWalletClient } from "@/lib/wallet";

const PLAN_PLACEHOLDER = `Outcome

Context

Constraints

Next steps`;

export function PlanComposer() {
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const [prepared, setPrepared] = useState<DraftPlaintext>();
  const [published, setPublished] = useState<PublishedDraft>();
  const [publishing, setPublishing] = useState(false);
  const [repository, setRepository] = useState("");
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

  const edit = useCallback(() => setPrepared(undefined), []);
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
            {publishing ? "Waiting for wallet…" : "Publish plan"}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form className="space-y-6" onSubmit={review}>
      <div className="space-y-2">
        <h1 className="font-heading font-semibold text-3xl tracking-tight">
          New plan
        </h1>
        <p className="text-muted-foreground">
          Capture the intent here. An agent can add repository detail later.
        </p>
      </div>
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
  );
}
