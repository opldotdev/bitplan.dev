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
    <>
      <h1>CLI setup</h1>
      <p>
        bitplan talks to a BRC-100 wallet on this machine. Encryption,
        decryption, signing, and funding are wallet calls. The CLI holds no
        keys.
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
          is the usual one. Any wallet serving the JSON API on{" "}
          <code>127.0.0.1:3321</code> works. Unlock it so the API is listening.
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
      </section>
      <p>
        Config and file-to-origin mappings live in <code>~/.bitplan/</code>.
        Neither file holds key material. Next:{" "}
        <Link href="/docs/commands">commands</Link>.
      </p>
    </>
  );
}
