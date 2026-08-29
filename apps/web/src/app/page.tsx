import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";
import { HomeCta } from "@/components/home-cta";

export const metadata: Metadata = {
  description:
    "Publish an encrypted HTML file as a 1Sat Ordinal. Your wallet encrypts and publishes. This site is the viewer.",
  title: {
    absolute: "BitPlan",
  },
};

export default function Home() {
  return (
    <main className="flex-1">
      <section className="relative isolate min-h-[100dvh] overflow-hidden">
        <Image
          alt="Watercolor of an empty grandiose library hall"
          className="object-cover object-[center_58%]"
          fill
          priority
          sizes="100vw"
          src="/home-library.jpg"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-background/15 dark:bg-background/30"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/50 via-background/10 to-background dark:from-background/40 dark:via-background/15 dark:to-background"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--background)_0%,transparent_62%)] opacity-30 dark:opacity-35"
        />
        <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-6 py-16">
          <div className="mx-auto max-w-5xl text-center">
            <h1 className="font-heading font-semibold text-[clamp(2.25rem,11vw,2.75rem)] leading-[1.08] tracking-tight md:text-5xl lg:whitespace-nowrap lg:text-6xl">
              Plan documents{" "}
              <span className="block lg:inline">
                on <em className="italic">Bitcoin</em>
                <span className="text-primary">.</span>
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-[36rem] text-foreground/75 md:text-lg">
              Publish an encrypted HTML file as a 1Sat Ordinal. Your wallet
              encrypts and publishes. This site is the viewer.
            </p>
            <HomeCta />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[42rem] space-y-10 px-6 py-16">
        <section className="space-y-3">
          <h2 className="font-medium text-lg tracking-tight">
            Publish with the BitPlan CLI
          </h2>
          <h3 className="font-medium text-sm">npm package bitplan</h3>
          <p className="text-muted-foreground">
            The CLI is published on the npm registry as bitplan. Run npx bitplan
            auth, then npx bitplan upload ./plan.html. bunx bitplan is the same
            binary. Your BRC-100 wallet protects the identity keys and publishes
            each version. Upload the same file again to reinscribe the same
            satoshi. One origin outpoint is the draft and its version history.
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
          <p className="text-muted-foreground">
            This site asks the connected wallet to open private drafts or unlock
            shared drafts. It stores no drafts server-side.
          </p>
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
