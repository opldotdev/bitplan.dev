import type { Metadata } from "next";
import Link from "next/link";

import { CodeExample } from "@/components/code-example";
import {
  ArchitectureDiagram,
  EncryptionDiagram,
  ReinscriptionDiagram,
} from "@/components/how-it-works-diagrams";

const PRIVATE_CODE = `
import { SymmetricKey, type WalletInterface } from "@bsv/sdk"

const protocolID: [2, string] = [2, "bitplan"]
type Wallet = Pick<WalletInterface, "encrypt">

export async function wrapPublisherKey(
  wallet: Wallet,
  keyID: string,
  documentKey: SymmetricKey,
) {
  const { ciphertext } = await wallet.encrypt({
    protocolID,
    keyID,
    counterparty: "self",
    plaintext: documentKey.toArray("be", 32),
  })
  return Uint8Array.from(ciphertext)
}
`;

const SHARED_CODE = `
import { SymmetricKey, type WalletInterface } from "@bsv/sdk"

const protocolID: [2, string] = [2, "bitplan"]
type Wallet = Pick<WalletInterface, "decrypt" | "encrypt">

const documentKey = SymmetricKey.fromRandom()
// boundPlanBytes includes headerSha256, which authenticates the public header.
const encryptedPlan = documentKey.encrypt(Array.from(boundPlanBytes))

const counterparty =
  readerIdentityKey === publisherIdentityKey ? "self" : readerIdentityKey
const { ciphertext: wrappedKey } = await wallet.encrypt({
  protocolID,
  keyID,
  counterparty,
  plaintext: documentKey.toArray("be", 32),
})

const { plaintext: keyBytes } = await readerWallet.decrypt({
  protocolID,
  keyID,
  counterparty: publisherIdentityKey,
  ciphertext: wrappedKey,
})

const decryptedPlan = new SymmetricKey(keyBytes).decrypt(encryptedPlan)
`;

export const metadata: Metadata = {
  description:
    "How BitPlan uses the BRC-100 wallet interface to publish and read encrypted 1Sat Ordinal inscriptions.",
  title: "How it works",
};

export default function HowItWorksPage() {
  return (
    <>
      <h1>How it works</h1>
      <p>
        BitPlan publishes encrypted HTML drafts as versioned 1Sat Ordinal
        inscriptions. BRC-100 is the interface BitPlan uses to talk to the
        wallet; it is not an inscription format. The CLI uses the SDK to encrypt
        the document once and asks the wallet to wrap its key for each reader.
        The wallet always owns the identity keys, signs, and publishes.
      </p>
      <ArchitectureDiagram />
      <p>
        bitplan.dev fetches public ciphertext from 1Sat. In the browser, the
        connected wallet unwraps the document key. The site has no drafts
        database, and plaintext never reaches its server.
      </p>
      <section id="encryption">
        <h2>Encryption</h2>
        <p>
          A BitPlan <Link href="/docs/envelope">envelope</Link> is a container.
          Its <code>BPLN</code> marker, version, and JSON header tell a reader
          how to open the encrypted body. The header is public and contains no
          secret key.
        </p>
        <EncryptionDiagram />
        <h3>Only you</h3>
        <p>
          The wallet encrypts the 32-byte document key to itself, not the whole
          document. It derives that wrap from the wallet root,
          <code> [2, &quot;bitplan&quot;]</code>, the draft&apos;s{" "}
          <code>keyID</code>, and <code>counterparty: &quot;self&quot;</code>.
          The root key and derived key stay in the wallet. The{" "}
          <code>keyID</code> is a public label, not a key.
        </p>
        <CodeExample
          code={PRIVATE_CODE}
          filename="self-slot.ts"
          label="See the publisher self slot"
        />
        <h3>You and named readers</h3>
        <p>
          The CLI creates a fresh random 32-byte document key and encrypts the
          plan once with the <code>@bsv/sdk</code> AES-256-GCM implementation.
          The wallet then encrypts that small key for the owner and each reader.
          A reader&apos;s identity key selects their copy; their wallet derives
          the matching key with the publisher as counterparty.
        </p>
        <p>
          The SDK gets both the document key and a fresh AES-GCM IV from the
          operating system&apos;s secure random generator. It stops with an
          error if secure randomness is unavailable. The encrypted plan also
          commits the exact public header. Changes made without the document key
          fail authentication.
        </p>
        <CodeExample
          code={SHARED_CODE}
          filename="reader-slots.ts"
          label="See the document key flow"
        />
        <h3>What this protects</h3>
        <p>
          AES-GCM hides the plan and detects changes to its ciphertext. A wrong
          wallet, key, or counterparty cannot decrypt it. The chain still
          reveals the envelope size, version, and the publisher and reader
          identity keys. Access to an older version cannot be revoked because
          that inscription is permanent.
        </p>
      </section>
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
            <strong>Encrypt.</strong> The plan is encrypted once with the SDK,
            then the wallet wraps its 32-byte document key for the owner and
            each reader. The wallet keeps every identity private key. The CLI
            builds the <Link href="/docs/envelope">envelope</Link>.
          </li>
          <li>
            <strong>Publish through the wallet.</strong> The wallet signs and
            broadcasts a new inscription, or spends the current draft coin to
            create its next version.
          </li>
          <li>
            <strong>Notify OrdFS.</strong> By default, the CLI sends the
            wallet-returned Atomic BEEF to 1Sat. 1Sat attempts to capture it for
            OrdFS and forwards the transaction to Arcade. The wallet publish
            remains authoritative; <code>--no-relay</code> opts out.
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
          not another copy of the document. A later version can drop invited
          readers, but no transaction can revoke access to an older inscription.
        </p>
      </section>
      <section id="reader-links">
        <h2>Reader links</h2>
        <p>
          A reader link is a throwaway key. Its public half is a normal reader
          slot. Its private half rides in the URL fragment, which browsers never
          send to a server. Anyone with the link can read until a version is
          published with <code>--private</code>.
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
          <code> wallet.decrypt</code>. The wallet returns the document key and
          the SDK decrypts the payload in the browser. The HTML stays in the
          browser and renders in a sandboxed iframe. The CLI equivalent is{" "}
          <code>bitplan fetch &lt;origin|url&gt;</code>.
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
          The current coin controls publishing; wallet keys control reading.
          Those capabilities can diverge. Sharing grants read access; it does
          not grant the recipient the draft coin or permission to publish the
          next version. The envelope does not sign authorship; the draft&apos;s
          origin and transaction chain establish who controls publishing.
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
