import type { Metadata } from "next";
import Link from "next/link";

import { CliCommands } from "@/components/cli-commands";
import { CommandCopy } from "@/components/command-copy";

export const metadata: Metadata = {
  description:
    "Connect a BRC-100 wallet, then publish with npx bitplan or bunx bitplan.",
  title: "CLI setup",
};

export default function CliSetupPage() {
  return (
    <main className="mx-auto w-full max-w-[42rem] flex-1 px-6 py-10">
      <div className="space-y-10">
        <div className="space-y-3">
          <h1 className="font-semibold text-2xl tracking-tight">CLI setup</h1>
          <p className="text-muted-foreground">
            bitplan talks to a BRC-100 wallet on this machine.{" "}
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="https://github.com/bitcoin-sv/desktop"
              rel="noopener noreferrer"
              target="_blank"
            >
              BSV Desktop
            </a>{" "}
            is the usual one. Any wallet serving the JSON API on{" "}
            <code className="font-mono text-sm">127.0.0.1:3321</code> works.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="font-semibold tracking-tight">Start the wallet</h2>
          <p className="text-muted-foreground text-sm">
            Unlock it so the JSON API is listening.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold tracking-tight">Check the connection</h2>
          <CommandCopy command="npx bitplan auth" />
          <p className="text-muted-foreground text-sm">
            <code className="font-mono">bunx bitplan auth</code> is the same
            command. <code className="font-mono">auth login</code> is an alias,
            kept for postplan muscle memory.
          </p>
          <CommandCopy command="npx bitplan whoami" />
        </section>

        <section className="space-y-4">
          <h2 className="font-semibold tracking-tight">Publish</h2>
          <CliCommands />
        </section>

        <p className="text-muted-foreground text-sm">
          Config and file-to-origin mappings live in{" "}
          <code className="font-mono">~/.bitplan/</code>. Neither file holds key
          material.{" "}
          <Link
            className="text-primary underline-offset-4 hover:underline"
            href="https://www.npmjs.com/package/bitplan"
          >
            Full CLI readme
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
