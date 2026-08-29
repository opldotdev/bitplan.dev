import type { Metadata } from "next";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  description:
    "Encrypt an HTML plan to your wallet and inscribe it on Bitcoin.",
  title: "Docs",
};

export default function DocsIntroPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="font-heading font-semibold text-3xl tracking-tight">
          BitPlan
        </h1>
        <p className="text-muted-foreground">
          The CLI encrypts a self-contained HTML document and inscribes it as a
          1Sat Ordinal. Upload the same file again and bitplan reinscribes the
          same satoshi. One origin outpoint is the draft&apos;s identity and its
          version history. This site is the viewer. It stores nothing.
        </p>
      </div>

      <div className="space-y-2">
        <CommandCopy command="npx bitplan" />
        <p className="text-muted-foreground text-sm">
          <code className="font-mono">bunx bitplan</code> is the same binary.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/docs/how-it-works">How it works</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs/cli-setup">CLI setup</Link>
        </Button>
      </div>
    </div>
  );
}
