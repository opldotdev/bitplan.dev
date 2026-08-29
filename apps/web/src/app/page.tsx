import Link from "next/link";

import { CliCommands } from "@/components/cli-commands";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[42rem] flex-1 px-6 py-10">
      <div className="space-y-10">
        <div className="space-y-3">
          <h1 className="font-semibold text-[2.5rem] leading-tight tracking-tight">
            Plan documents on Bitcoin.
          </h1>
          <p className="text-muted-foreground">
            The CLI encrypts an HTML file to your wallet and inscribes it as a
            1Sat Ordinal. Later uploads of the same file become new versions of
            the same coin. This site is the viewer. It stores nothing.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="font-semibold text-lg tracking-tight">CLI</h2>
          <CliCommands />
          <p className="text-muted-foreground text-sm">
            Needs a BRC-100 wallet on this machine, unlocked.{" "}
            <Link
              className="text-primary underline-offset-4 hover:underline"
              href="/cli"
            >
              CLI setup
            </Link>
          </p>
        </section>

        <p className="text-sm">
          <Link
            className="text-primary underline-offset-4 hover:underline"
            href="/drafts"
          >
            My drafts
          </Link>
          <span className="text-muted-foreground"> · </span>
          <Link
            className="text-primary underline-offset-4 hover:underline"
            href="/cli"
          >
            CLI setup
          </Link>
        </p>

        <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://www.npmjs.com/package/bitplan"
          >
            CLI on npm
          </a>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://github.com/opldotdev/bitplan.dev/blob/master/packages/cli/ENVELOPE.md"
          >
            Envelope spec
          </a>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://k57tkc9tukz5.postplan.dev"
          >
            How it compares to postplan
          </a>
        </p>
      </div>
    </main>
  );
}
