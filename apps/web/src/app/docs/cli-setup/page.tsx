import type { Metadata } from "next";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";

export const metadata: Metadata = {
  description:
    "Connect a BRC-100 wallet, then publish with npx bitplan or bunx bitplan.",
  title: "CLI setup",
};

export default function CliSetupPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="font-heading font-semibold text-3xl tracking-tight">
          CLI setup
        </h1>
        <p className="text-muted-foreground">
          bitplan talks to a BRC-100 wallet on this machine. Encryption,
          decryption, signing, and funding are wallet calls. The CLI holds no
          keys.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-heading font-medium text-lg tracking-tight">
          Start the wallet
        </h2>
        <p className="text-muted-foreground text-sm">
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
          Unlock it so the API is listening.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-medium text-lg tracking-tight">
          Check the connection
        </h2>
        <CommandCopy command="npx bitplan auth" />
        <p className="text-muted-foreground text-sm">
          <code className="font-mono">bunx bitplan auth</code> is the same
          command. <code className="font-mono">auth login</code> is an alias,
          kept for postplan muscle memory. There is no API key to paste.
        </p>
        <CommandCopy command="npx bitplan whoami" />
      </section>

      <p className="text-muted-foreground text-sm">
        Config and file-to-origin mappings live in{" "}
        <code className="font-mono">~/.bitplan/</code>. Neither file holds key
        material. Next:{" "}
        <Link
          className="text-primary underline-offset-4 hover:underline"
          href="/docs/commands"
        >
          commands
        </Link>
        .
      </p>
    </div>
  );
}
