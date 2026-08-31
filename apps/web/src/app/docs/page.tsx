import type { Metadata } from "next";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  description:
    "Publish encrypted HTML plans as 1Sat Ordinal inscriptions using the BRC-100 wallet interface.",
  title: "Docs",
  twitter: { card: "summary_large_image" },
};

export default function DocsIntroPage() {
  return (
    <>
      <h1>BitPlan</h1>
      <p>
        The BitPlan CLI packages a self-contained HTML document and uses the
        BRC-100 interface to ask your wallet to publish it as an encrypted 1Sat
        Ordinal inscription. The package on npm is <code>bitplan</code>. Upload
        it again to reinscribe the same satoshi. One origin outpoint identifies
        the draft and its version history. This site is the viewer. It stores no
        drafts server-side.
      </p>
      <h2>BitPlan CLI setup</h2>
      <p>
        Start with <Link href="/docs/cli-setup">CLI setup</Link>, then{" "}
        <Link href="/docs/commands">commands</Link>. If a coding agent will use
        BitPlan, read <Link href="/docs/agents">agents and wallets</Link>.
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
