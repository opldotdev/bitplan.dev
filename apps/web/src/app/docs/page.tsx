import type { Metadata } from "next";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  description:
    "Create encrypted HTML plans, keep them hosted while they change, or publish them as 1Sat Ordinals.",
  title: "Docs",
  twitter: { card: "summary_large_image" },
};

export default function DocsIntroPage() {
  return (
    <>
      <h1>BitPlan</h1>
      <p>
        BitPlan turns one self-contained HTML file into an encrypted plan. Your
        BRC-100 wallet holds the keys. While the plan is changing, bitplan.dev
        can host its ciphertext at a private reader link. When it should be
        permanent, publish the same encrypted plan as a 1Sat Ordinal. The
        package on npm is <code>bitplan</code>.
      </p>
      <h2>Start with a hosted draft</h2>
      <p>
        This costs no BSV. The server stores encrypted bytes and cannot read the
        plan. Anyone who gets the complete reader link can read it, so treat the
        link like a password.
      </p>
      <div className="not-typeset mt-5">
        <CommandCopy command="bunx bitplan upload ./plan.html --hosted --link" />
      </div>
      <p>
        After a hosted upload, the CLI tries to sync an encrypted catalog. The
        sync is best effort and never fails the upload. Connect the same BRC-100
        wallet identity on <Link href="/drafts">drafts</Link> and the browser
        can locate and decrypt that catalog to list your own hosted plans on
        another device. BitPlan keeps only ciphertext and a hash used to check
        later writes.
      </p>
      <h2>Publish on chain</h2>
      <p>
        Use <code>bitplan inscribe</code> when the draft is ready to become a
        permanent 1Sat Ordinal. The hosted URL then points to the on-chain
        origin.
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
