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
            BitPlan publishes an encrypted HTML file as a 1Sat Ordinal. Your
            BRC-100 wallet protects the identity keys and publishes each
            version. This site asks it to open private drafts or unlock shared
            drafts. It stores no drafts server-side. Upload the same file again
            to reinscribe the same satoshi. One origin outpoint is the draft and
            its version history.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="font-medium text-lg tracking-tight">
            Publish with the BitPlan CLI
          </h2>
          <h3 className="font-medium text-sm">npm package bitplan</h3>
          <p className="text-muted-foreground">
            The CLI is published on the npm registry as bitplan. Run npx bitplan
            auth, then npx bitplan upload ./plan.html. bunx bitplan is the same
            binary.
          </p>
          <h3 className="font-medium text-sm">Auth</h3>
          <CommandCopy command="npx bitplan auth" />
          <p className="text-muted-foreground text-sm">
            Needs a BRC-100 wallet on this machine, unlocked.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium text-lg tracking-tight">
            Open a BitPlan draft
          </h2>
          <h3 className="font-medium text-sm">Docs and OpenAPI</h3>
          <p className="text-muted-foreground">
            BitPlan docs start at /docs. The OpenAPI read surface is
            /openapi.json. API versioning and Sunset policy are at /docs/api.
          </p>
          <h3 className="font-medium text-sm">Viewer</h3>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/docs">Get started</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/drafts">My drafts</Link>
            </Button>
          </div>
        </section>

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
