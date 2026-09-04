import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";
import { HomeCta } from "@/components/home-cta";

export const metadata: Metadata = {
  description:
    "Secure agent plans, encrypted before upload. Host a working draft, then publish it as a 1Sat Ordinal.",
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
            <h1 className="font-heading font-semibold text-[clamp(2rem,10vw,2.5rem)] leading-[1.08] tracking-tight md:text-6xl lg:text-7xl">
              Secure agent plans{" "}
              <span className="block">
                <em className="italic">on your terms</em>
                <span className="text-primary">.</span>
              </span>
            </h1>
            <p className="mx-auto mt-5 text-foreground/75 md:text-xl">
              Encrypted before upload.{" "}
              <span className="block">
                Hosted while changing. On Bitcoin when ready.
              </span>
            </p>
            <HomeCta />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[42rem] space-y-10 px-6 py-16">
        <section className="space-y-3">
          <h2 className="font-medium text-lg tracking-tight">
            Create with the BitPlan CLI
          </h2>
          <h3 className="font-medium text-sm">npm package bitplan</h3>
          <p className="text-muted-foreground">
            The CLI is published on the npm registry as bitplan. Run npx bitplan
            auth, then create a hosted draft with bunx bitplan upload
            ./plan.html --hosted --link. Your BRC-100 wallet protects the
            identity keys. Hosted drafts cost no BSV. When the plan is ready,
            the wallet can publish it as a 1Sat Ordinal.
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
          <h3 className="font-medium text-sm">Docs</h3>
          <p className="text-muted-foreground">
            BitPlan docs start at /docs. They explain the CLI, wallet flow,
            encrypted envelope, and agent integration.
          </p>
          <h3 className="font-medium text-sm">Viewer</h3>
          <p className="text-muted-foreground">
            This site opens encrypted plans with an authorized wallet or reader
            link. Hosted storage contains ciphertext, never plaintext or wallet
            keys.
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
