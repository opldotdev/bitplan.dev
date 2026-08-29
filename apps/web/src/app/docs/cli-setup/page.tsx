import type { Metadata } from "next";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";

export const metadata: Metadata = {
  description:
    "Connect a BRC-100 wallet, then publish with npx bitplan or bunx bitplan.",
  title: "BitPlan CLI",
};

export default function CliSetupPage() {
  return (
    <>
      <h1>BitPlan CLI</h1>
      <p>
        bitplan talks to a BRC-100 wallet on this machine. The wallet owns every
        identity key and handles BRC-2 wrapping, unwrapping, signing, and
        funding. Shared payloads use the standard SDK symmetric cipher; the CLI
        holds no identity private keys.
      </p>
      <section id="start-the-wallet">
        <h2>Start the wallet</h2>
        <p>
          <a
            href="https://desktop.bsvb.tech/"
            rel="noopener noreferrer"
            target="_blank"
          >
            BSV Desktop
          </a>{" "}
          is the usual one. The CLI defaults to a BRC-100-compatible JSON
          endpoint at <code>http://127.0.0.1:3321</code>. Use{" "}
          <code>--wallet-url</code> for another endpoint; start and unlock the
          wallet before key or spending commands. Shared uploads use ordinary
          BRC-100 <code>encrypt</code> requests for a 32-byte document key.
          Because BitPlan uses security level 2, the wallet can ask for
          permission for each new reader.
        </p>
      </section>
      <section id="check-the-connection">
        <h2>Check the connection</h2>
        <div className="not-typeset mt-4">
          <CommandCopy command="npx bitplan auth" />
        </div>
        <p>
          <code>bunx bitplan auth</code> is the same command.
        </p>
        <div className="not-typeset mt-4">
          <CommandCopy command="npx bitplan whoami" />
        </div>
        <div className="not-typeset mt-4">
          <CommandCopy command="npx bitplan version" />
        </div>
      </section>
      <p>
        Config and file-to-origin mappings live in <code>~/.bitplan/</code>.
        Neither file holds key material. Next:{" "}
        <Link href="/docs/commands">commands</Link>.
      </p>
    </>
  );
}
