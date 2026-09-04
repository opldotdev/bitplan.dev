import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  description:
    "BitPlan is a CLI and viewer for encrypted hosted drafts and permanent 1Sat Ordinal plans.",
  title: "About",
};

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-[42rem] flex-1 px-6 py-10">
      <div className="typeset">
        <h1>About</h1>
        <p>
          BitPlan creates encrypted HTML plans. Keep a working draft hosted as
          ciphertext, then publish it as a 1Sat Ordinal when it should be
          permanent. The CLI is the npm package <code>bitplan</code>.
        </p>
        <p>
          A BRC-100 wallet on your machine owns the identity keys and encrypts.
          Hosted drafts need no BSV. On chain, the wallet signs and publishes;
          each version reinscribes the same satoshi at one permanent origin.
        </p>
        <p>
          The product is two pieces: the npm CLI <code>bitplan</code>, and this
          viewer. The CLI talks to a local BRC-100 wallet and encrypts the HTML.
          The viewer loads ciphertext from hosted storage or 1Sat, then decrypts
          it in the browser with a wallet or reader link. BitPlan is not a
          general website host or notes app.
        </p>
        <p>
          Start with <Link href="/docs/cli-setup">BitPlan CLI</Link>, or read{" "}
          <Link href="/docs/how-it-works">how it works</Link>. Source is on{" "}
          <a href="https://github.com/opldotdev/bitplan.dev">GitHub</a>.
        </p>
      </div>
    </main>
  );
}
