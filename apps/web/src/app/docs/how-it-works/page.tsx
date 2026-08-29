import type { Metadata } from "next";
import Link from "next/link";

import {
  ArchitectureDiagram,
  ReinscriptionDiagram,
} from "@/components/how-it-works-diagrams";

export const metadata: Metadata = {
  description:
    "How BitPlan uses a BRC-100 wallet to encrypt, publish, version, and read HTML drafts.",
  title: "How it works",
};

export default function HowItWorksPage() {
  return (
    <>
      <h1>How it works</h1>
      <p>
        BitPlan publishes encrypted HTML drafts as versioned 1Sat Ordinals.
        Private drafts are encrypted by the wallet. For sharing, the CLI uses
        the SDK to encrypt the document once and asks the wallet to wrap its key
        for each reader. The wallet always owns the identity keys, signs, and
        publishes.
      </p>
      <ArchitectureDiagram />
      <p>
        bitplan.dev fetches public ciphertext through OrdFS. In the browser, the
        connected wallet decrypts a private draft or unwraps a shared document
        key. The site has no drafts database, and plaintext never reaches its
        server.
      </p>
      <section id="publishing">
        <h2>Publishing</h2>
        <ol>
          <li>
            <strong>Check locally.</strong> The CLI validates the HTML and scans
            the document and metadata for secrets. A failure stops the upload
            before the wallet is called.
          </li>
          <li>
            <strong>Confirm.</strong> The CLI shows an approximate envelope size
            and content fee, then asks for confirmation.
          </li>
          <li>
            <strong>Encrypt.</strong> A private draft is one BRC-2{" "}
            <code>wallet.encrypt</code> call. A shared draft is encrypted once
            with the SDK, then the wallet BRC-2-wraps its 32-byte key for the
            owner and each reader. The wallet keeps every identity private key.
            The CLI builds the <Link href="/docs/envelope">envelope</Link>.
          </li>
          <li>
            <strong>Publish through the wallet.</strong> The wallet signs and
            broadcasts a new inscription, or spends the current draft coin to
            create its next version.
          </li>
        </ol>
      </section>
      <section id="sharing">
        <h2>Sharing</h2>
        <p>
          <code>--share-with &lt;identity-key&gt;</code> adds a reader to the
          next version. The recipient&apos;s wallet unwraps the document key
          using the publisher&apos;s public identity key. These public keys
          identify the counterparties; they are not the symmetric document key.
          BRC-42 derivation and identity-key operations stay inside each BRC-100
          wallet.
        </p>
        <p>
          The access list is public. Each reader adds only a small wrapped key,
          not another copy of the document. <code>--private</code> makes a later
          version wallet-only, but no transaction can revoke access to an older
          shared inscription.
        </p>
      </section>
      <section id="versions">
        <h2>Versions</h2>
        <p>
          The first inscription&apos;s origin outpoint is the draft ID. Each
          update spends the current 1-sat output and carries the next encrypted
          envelope forward. <code>/d/&lt;origin&gt;</code> resolves the latest
          version; <code>?v=n</code> pins one version.
        </p>
        <ReinscriptionDiagram />
      </section>
      <section id="reading">
        <h2>Reading</h2>
        <p>
          The viewer fetches and validates the encrypted envelope, then calls
          <code> wallet.decrypt</code>. For a shared draft the wallet returns
          the document key and the SDK decrypts the payload in the browser. The
          HTML stays in the browser and renders in a sandboxed iframe. The CLI
          equivalent is <code>bitplan fetch &lt;origin|url&gt;</code>.
        </p>
        <p>
          <code>bitplan list</code> finds drafts by asking the wallet for
          outputs in its <code>1sat</code> basket tagged{" "}
          <code>type:application/x-bitplan</code>. Local state is only a
          metadata cache; it contains no wallet keys.
        </p>
      </section>
      <section id="the-wallet">
        <h2>Control and recovery</h2>
        <p>
          The current coin controls publishing; the BRC-2 keys control reading.
          Those capabilities can diverge. Sharing grants read access; it does
          not grant the recipient the draft coin or permission to publish the
          next version. BitPlan does not provide key rotation, recovery, or
          ownership transfer.
        </p>
        <p>
          Ciphertext is public and permanent. Encryption does not restore a
          delete button, which is why every upload is scanned for secrets.
        </p>
      </section>
      <p>
        Start with <Link href="/docs/cli-setup">CLI setup</Link>, or inspect the{" "}
        <Link href="/docs/envelope">envelope format</Link>.
      </p>
    </>
  );
}
