import type { Metadata } from "next";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  description:
    "Publish an encrypted HTML file as a 1Sat Ordinal. Your wallet encrypts and publishes. This site is the viewer.",
  title: {
    absolute: "BitPlan",
  },
};

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[42rem] flex-1 px-6 py-10">
      <div className="space-y-10">
        <div className="space-y-3">
          <h1 className="font-semibold text-[2.5rem] leading-tight tracking-tight">
            Plan documents on Bitcoin.
          </h1>
          <p className="text-muted-foreground">
            Publish an encrypted HTML file as a 1Sat Ordinal. Your BRC-100
            wallet protects the identity keys and publishes each version. This
            site asks it to open private drafts or unlock shared drafts. It
            stores no drafts server-side.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/docs">Get started</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/drafts">My drafts</Link>
          </Button>
        </div>

        <div className="space-y-2">
          <CommandCopy command="npx bitplan auth" />
          <p className="text-muted-foreground text-sm">
            Needs a BRC-100 wallet on this machine, unlocked.
          </p>
        </div>

        <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://www.npmjs.com/package/bitplan"
          >
            CLI on npm
          </a>
          <Link
            className="text-primary underline-offset-4 hover:underline"
            href="/docs/envelope"
          >
            Envelope spec
          </Link>
          <Link
            className="text-primary underline-offset-4 hover:underline"
            href="/docs/how-it-works"
          >
            How it works
          </Link>
        </p>
      </div>
    </main>
  );
}
