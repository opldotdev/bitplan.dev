import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
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

          <details
            className="rounded-md border bg-background/80 p-4 text-left"
            id="add-your-bot"
          >
            <summary className="cursor-pointer font-medium">
              Add your bot
            </summary>
            <p className="mt-3 text-muted-foreground text-sm">
              Give Grok or another bot its own decryption identity. Copy this
              prompt to your bot; only its public key comes back to you.
            </p>
            <CodeBlock
              className="mt-3"
              code={`Use your operator-approved local wallet tooling to create or reuse
a dedicated BitPlan reader identity. Inspect @1sat/cli help first.
Keep private keys and seeds inside secure wallet storage, never in
chat, model context, logs, or source control.

Return only your public identity key and a verified BRC-100
decryption method. If that interface is unavailable, report the gap
rather than building an unauthenticated key server.

After I add you and republish, verify you can decrypt the new version
and read its annotations before proposing revisions.`}
              language="markdown"
            >
              <CodeBlockHeader>
                <CodeBlockTitle>Prompt for your bot</CodeBlockTitle>
                <CodeBlockActions>
                  <CodeBlockCopyButton aria-label="Copy bot prompt" />
                </CodeBlockActions>
              </CodeBlockHeader>
            </CodeBlock>
            <p className="mt-3 text-muted-foreground text-sm">
              On your publishing device, add the public key as a contact, add
              that contact to your team, and publish a new version shared with
              the team. This grants reading access—not ownership or publishing
              permission.
            </p>
            <CodeBlock
              className="mt-3"
              code={`npx bitplan contact set my-bot <verified-public-identity-key>
npx bitplan team add my-team my-bot
npx bitplan upload ./plan.html --hosted --share-with my-team`}
              language="bash"
            >
              <CodeBlockHeader>
                <CodeBlockTitle>On your publishing device</CodeBlockTitle>
                <CodeBlockActions>
                  <CodeBlockCopyButton aria-label="Copy bot contact commands" />
                </CodeBlockActions>
              </CodeBlockHeader>
            </CodeBlock>
            <p className="mt-3 text-muted-foreground text-sm">
              Replace the placeholders and verify the public key with your bot.
              These commands share a document version. Live collaboration still
              needs a separate private invitation; connecting a wallet does not
              yet verify annotation authorship or grant room access.
            </p>
            <Link
              className="mt-3 inline-block text-sm underline underline-offset-4"
              href="/docs/agents#teams"
            >
              Contact and team commands
            </Link>
          </details>

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
