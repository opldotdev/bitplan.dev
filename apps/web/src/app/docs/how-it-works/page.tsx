import type { Metadata } from "next";
import Link from "next/link";

import {
  ArchitectureDiagram,
  ReinscriptionDiagram,
} from "@/components/how-it-works-diagrams";

export const metadata: Metadata = {
  description:
    "How BitPlan publishes encrypted HTML plans as 1Sat Ordinals, versus a typical hosted artifact stack.",
  title: "How it works",
};

export default function HowItWorksPage() {
  return (
    <>
      <h1>How it works</h1>
      <p>
        A typical artifact system puts the HTML on a host. A CLI uploads to an
        API server. The server writes Postgres and object storage. The people
        who run that server can read every draft, change it, lose it, or be
        compelled to hand it over.
      </p>
      <p>
        BitPlan has no such host. The CLI encrypts the document to your wallet
        with BRC-2 and inscribes it as a 1Sat Ordinal on BSV. The first
        inscription&apos;s origin outpoint is the draft&apos;s identity. Later
        uploads of the same file spend that satoshi with a new envelope, so the
        chain itself is the version history. This site is the viewer. It stores
        nothing.
      </p>
      <p>
        On a typical host, the worst case is one company reads the plan. On
        BitPlan, the worst case is everyone reads it, forever: a published
        transaction cannot be deleted or amended. Encryption is on for every
        publish. v1 has no cleartext path.
      </p>
      <ArchitectureDiagram />
      <p>
        Only the wallet that holds the coin can spend it, so only that wallet
        can publish the next version or decrypt the old ones.{" "}
        <code>bitplan list</code> reads the wallet&apos;s ordinals, filtered to
        MAP <code>app=bitplan</code>. There is no <code>/api/drafts</code>.
      </p>
      <section id="publishing">
        <h2>Publishing</h2>
        <p>
          <code>npx bitplan upload ./plan.html</code> does this, in order,
          before anything is broadcast:
        </p>
        <ol>
          <li>
            <strong>Validate.</strong> A parse5 walk rejects forms, iframes,
            object and embed tags, external scripts, event handlers,{" "}
            <code>javascript:</code> URLs, and meta-refresh. Inline classic JS
            can ship in the file; the viewer still serves it with{" "}
            <code>script-src &apos;none&apos;</code>. Documents over 512 KB are
            rejected. Validation fails locally, before anything hits the
            network.
          </li>
          <li>
            <strong>Scan for secrets.</strong> The scanner looks at the
            plaintext HTML and metadata for API keys, private keys, connection
            strings, and similar. A hit blocks the publish until you remove it
            or waive that finding with <code>--allow-finding</code>. The scan
            runs on every publish. Ciphertext is public forever, so a secret
            sealed today is a secret leaked if the cipher or the wrap ever
            breaks.
          </li>
          <li>
            <strong>Show the bill.</strong> Byte count, a fee estimate at 1
            sat/KB, and the warning: publishing is permanent. The content is
            encrypted, but the ciphertext is public forever and cannot be
            deleted, edited, or taken back. Confirm with <code>y</code>, or pass{" "}
            <code>--yes</code> when there is no TTY.
          </li>
          <li>
            <strong>Encrypt.</strong> The wallet encrypts the UTF-8 JSON
            document (the HTML plus metadata) with BRC-2,{" "}
            <code>counterparty: &quot;self&quot;</code>. The CLI holds no keys.
            The on-chain wrapper is the{" "}
            <Link href="/docs/envelope">envelope</Link>.
          </li>
          <li>
            <strong>Inscribe or reinscribe.</strong> A first publish calls{" "}
            <code>inscribe</code>. The origin outpoint becomes the draft ID. A
            later publish spends the current coin into a new output that carries
            a new envelope. One transaction per version.
          </li>
          <li>
            <strong>Record locally.</strong> <code>~/.bitplan/drafts.json</code>{" "}
            maps the file path to the origin, the keyID, and the latest
            outpoint. Titles live inside the ciphertext, so{" "}
            <code>bitplan list</code> reads them from this cache, or decrypts on
            a fresh machine.
          </li>
        </ol>
      </section>
      <section id="versions">
        <h2>Versions</h2>
        <p>
          The draft is the coin. Every version is a spend of that same satoshi
          carrying new content. The indexer tracks the origin chain.{" "}
          <code>/d/&lt;origin&gt;</code> is the latest. <code>?v=n</code> is a
          specific version.
        </p>
        <ReinscriptionDiagram />
      </section>
      <section id="reading">
        <h2>Reading</h2>
        <p>
          bitplan.dev resolves <code>/d/&lt;origin&gt;</code> through a public
          indexer (OrdFS) to the newest inscription in the chain, fetches the
          bytes, and decrypts in the browser with the connected wallet. The
          plaintext never reaches this site. Agents that need the HTML run{" "}
          <code>bitplan fetch &lt;origin|url&gt;</code>, which does the same
          over HTTP and prints the document to stdout.
        </p>
        <p>
          Draft routes send <code>X-Robots-Tag: noindex</code> and are
          disallowed in <code>robots.txt</code>. A crawler that ignores both
          still only fetches ciphertext. The chain itself remains public.
        </p>
      </section>
      <section id="the-wallet">
        <h2>The wallet is the account</h2>
        <p>
          If the wallet is gone, the ciphertext on chain is unreadable. If
          someone else gets the key, they can read every draft wrapped to that
          key, and they can publish junk versions until you sweep the coins to a
          fresh key. Rotation stops future publishes from the old key. It does
          not rewind history, and it does not un-decrypt what they already hold.
        </p>
      </section>
      <section id="newspaper">
        <h2>Treat the chain like a newspaper</h2>
        <p>
          Encryption sets the cost of reading. It does not restore a delete
          button. That is why the secret scanner runs even though every publish
          is encrypted.
        </p>
        <p>
          Start with <Link href="/docs/cli-setup">CLI setup</Link>. The on-chain
          bytes are in the <Link href="/docs/envelope">envelope spec</Link>.
        </p>
      </section>
    </>
  );
}
