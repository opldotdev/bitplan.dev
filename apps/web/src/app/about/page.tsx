import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  description:
    "BitPlan is a CLI and a viewer for encrypted HTML plan documents on Bitcoin.",
  title: "About",
};

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-[42rem] flex-1 px-6 py-10">
      <div className="typeset">
        <h1>About</h1>
        <p>
          BitPlan publishes encrypted HTML plan documents as 1Sat Ordinals on
          Bitcoin SV. The CLI is the npm package <code>bitplan</code>. This
          website is the viewer. It does not store drafts.
        </p>
        <p>
          A BRC-100 wallet on your machine owns the identity keys, encrypts,
          signs, and publishes. Upload the same file again to reinscribe the
          same satoshi. One origin outpoint is the draft and its version
          history.
        </p>
        <p>
          The product is two pieces: the npm CLI <code>bitplan</code>, and this
          viewer. The CLI talks to a BRC-100 wallet on 127.0.0.1:3321, encrypts
          HTML, and inscribes it. The viewer fetches ciphertext from 1Sat and
          asks the same kind of wallet to decrypt. Neither piece is a hosted
          notes app.
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
