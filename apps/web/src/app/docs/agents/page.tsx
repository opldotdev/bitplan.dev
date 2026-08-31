import type { Metadata } from "next";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";

export const metadata: Metadata = {
  description:
    "Let coding agents use BitPlan through a BRC-100 wallet without sharing wallet keys.",
  title: "Agents and wallets",
};

export default function AgentsAndWalletsPage() {
  return (
    <>
      <h1>Agents and wallets</h1>
      <p>
        Your wallet keeps its keys. A coding agent uses the BitPlan CLI to
        request an operation through a standard wallet connection. The wallet
        checks the request and signs only what you allow.
      </p>

      <section id="desktop">
        <h2>Use BitPlan on a desktop</h2>
        <p>
          Start and unlock a BRC-100 wallet on the same computer. BitPlan uses
          its JSON endpoint at <code>http://127.0.0.1:3321</code> by default.
          Then an agent can run the same commands you run:
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
          Use <code>--wallet-url</code> if the wallet listens somewhere else.
          JSON mode returns one value that an agent can read without scraping
          the normal terminal text. It does not weaken wallet permissions, and
          publishing still requires <code>--yes</code>. The CLI never asks for a
          mnemonic or identity private key.
        </p>
      </section>

      <section id="phone">
        <h2>Phone approval is not available yet</h2>
        <p>
          BitPlan cannot currently use a phone as a remote BRC-100 wallet. The
          CLI needs an unlocked BRC-100 wallet it can reach from the same
          computer. A future standard connection could let a phone approve
          desktop requests without sharing its mnemonic, but that workflow is
          not ready to use or test today.
        </p>
        <p>
          1Sat Wallet&apos;s current app handoff can approve a payment opened on
          the same phone. It is not a desktop session and does not expose the
          complete BRC-100 interface that BitPlan needs.
        </p>
      </section>

      <section id="unattended">
        <h2>Unattended agents need narrower access</h2>
        <p>
          Do not give a background agent control of your main wallet. Give it a
          separate, revocable BitPlan identity with access only to the BitPlan
          protocol and basket. Keep spending low, or require approval before a
          plan is published.
        </p>
        <p>
          A new identity cannot open old plans that were encrypted only for your
          main wallet. Share a new version with that identity first. Publishing
          the next version spends the plan&apos;s current one-satoshi output, so
          the wallet holding that output must approve the update.
        </p>
      </section>

      <section id="wallet-checklist">
        <h2>Wallet compatibility checklist</h2>
        <p>A wallet is ready for BitPlan when it can:</p>
        <ul>
          <li>
            authenticate the application origin before reusing permissions;
          </li>
          <li>serve the standard BRC-100 JSON interface;</li>
          <li>list BitPlan outputs and encrypt or decrypt plan data;</li>
          <li>create, sign, and publish plan transactions;</li>
          <li>show, remember, and revoke permissions;</li>
          <li>
            lock and reconnect without losing the user&apos;s plan history.
          </li>
        </ul>
        <p>
          Test new wallet builds with a test wallet first. Publish a first
          version, update it, share it, fetch it with the allowed identity, and
          confirm that a different identity is refused.
        </p>
      </section>

      <section id="web-agents">
        <h2>Agents in the browser</h2>
        <p>
          BitPlan&apos;s WebMCP tools can open the composer, prepare a plan for
          review, list IDs from a wallet already connected to the tab, and open
          one of those plans in the visible viewer. They do not connect a wallet
          for the user, publish, or return decrypted plan text to the agent. The
          user still reviews the plan and approves the wallet action.
        </p>
        <ul>
          <li>
            <code>start_bitplan_plan</code> opens the composer.
          </li>
          <li>
            <code>prepare_bitplan_plan</code> fills the review preview.
          </li>
          <li>
            <code>list_my_bitplans</code> returns plan IDs and viewer links.
          </li>
          <li>
            <code>open_bitplan</code> opens a plan in the visible viewer.
          </li>
        </ul>
      </section>

      <p>
        Start with <Link href="/docs/cli-setup">CLI setup</Link>, then see all{" "}
        <Link href="/docs/commands">commands</Link>.
      </p>
    </>
  );
}
