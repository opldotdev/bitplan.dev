import type { Metadata } from "next";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  description:
    "Publish encrypted HTML plans through a BRC-100 wallet on Bitcoin.",
  title: "Docs",
  twitter: { card: "summary_large_image" },
};

export default function DocsIntroPage() {
  return (
    <>
      <h1>BitPlan</h1>
      <p>
        The CLI packages a self-contained HTML document and asks your BRC-100
        wallet to publish it as an encrypted 1Sat Ordinal. Upload it again to
        reinscribe the same satoshi. One origin outpoint identifies the draft
        and its version history. This site is the viewer. It stores no drafts
        server-side.
      </p>
      <div className="not-typeset mt-5">
        <CommandCopy command="npx bitplan" />
        <p className="mt-2 text-muted-foreground text-sm">
          <code className="font-mono">bunx bitplan</code> is the same binary.
        </p>
      </div>
      <div className="not-typeset mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/docs/how-it-works">How it works</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs/cli-setup">CLI setup</Link>
        </Button>
      </div>
    </>
  );
}
