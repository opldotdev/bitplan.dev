import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";
import { HomeCta } from "@/components/home-cta";
import { SkillInstall } from "@/components/skill-install";

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

      <section className="flex min-h-[100dvh] items-center justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-2xl space-y-8 text-center">
          <div className="space-y-3">
            <h2 className="font-heading font-semibold text-3xl tracking-tight md:text-4xl">
              Teach your agent
            </h2>
            <p className="text-balance text-foreground/70 md:text-lg">
              Install the skill once. Your agent writes, hosts, shares, and
              publishes plans through your wallet.
            </p>
          </div>

          <SkillInstall />

          <div className="space-y-3 text-left">
            <p className="text-center text-muted-foreground text-sm">
              Then, with a BRC-100 wallet unlocked:
            </p>
            <CommandCopy command="npx bitplan auth" />
          </div>

          <p className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            <Link
              className="text-primary underline-offset-4 hover:underline"
              href="/docs"
            >
              Docs
            </Link>
            <Link
              className="text-primary underline-offset-4 hover:underline"
              href="/docs/how-it-works"
            >
              How it works
            </Link>
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="https://www.npmjs.com/package/bitplan"
            >
              CLI on npm
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
