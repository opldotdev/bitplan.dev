import type { Metadata } from "next";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";

export const metadata: Metadata = {
  description: "Use BitPlan with coding agents and more than one wallet.",
  title: "Agents and wallets",
};

export default function AgentsAndWalletsPage() {
  return (
    <>
      <h1>Agents and wallets</h1>
      <p>
        A coding agent runs the BitPlan CLI. Your wallet keeps the keys and
        approves encryption and publishing.
      </p>

      <section id="desktop">
        <h2>Use BitPlan with a coding agent</h2>
        <p>
          Start and unlock a compatible BRC-100 wallet on the same computer.
          Then the agent can run:
        </p>
        <div className="not-typeset my-4">
          <CommandCopy command="npx bitplan list --json" />
        </div>
        <div className="not-typeset my-4">
          <CommandCopy command="npx bitplan fetch &lt;origin&gt; --json" />
        </div>
        <div className="not-typeset my-4">
          <CommandCopy command="npx bitplan upload ./plan.html --yes --json" />
        </div>
        <p>
          The CLI never asks for a mnemonic or private key. The wallet still
          controls every permission.
        </p>
      </section>

      <section id="phone">
        <h2>Read the same plan on your phone</h2>
        <p>
          If both devices use the same wallet identity, nothing else is needed.
          If they use different identities, add the phone wallet as a reader.
          BitPlan encrypts the plan for both wallets without copying either
          wallet&apos;s private keys.
        </p>
        <ol>
          <li>
            On the phone, open <Link href="/drafts">My drafts</Link>, connect
            the wallet, and choose <strong>Copy wallet ID</strong>.
          </li>
          <li>On the desktop, save that public ID as a default reader:</li>
        </ol>
        <div className="not-typeset my-4">
          <CommandCopy command="npx bitplan config --share-with &lt;phone-wallet-id&gt;" />
        </div>
        <ol start={3}>
          <li>Publish normally. New plans will include the phone wallet.</li>
          <li>Open the plan&apos;s viewer link on the phone.</li>
        </ol>
        <p>
          The wallet ID is a public key, not a secret. Use{" "}
          <code>npx bitplan config --clear-share-with</code> to stop adding it
          to new plans.
        </p>
      </section>

      <section id="web-agents">
        <h2>Browser agents</h2>
        <p>
          BitPlan&apos;s WebMCP tools can prepare a plan, list encrypted plan
          IDs, and open the viewer. They cannot publish or read decrypted plan
          text.
        </p>
      </section>

      <p>
        See <Link href="/docs/cli-setup">CLI setup</Link> and all{" "}
        <Link href="/docs/commands">commands</Link>.
      </p>
    </>
  );
}
