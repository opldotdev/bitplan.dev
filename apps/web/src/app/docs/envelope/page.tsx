import type { Metadata } from "next";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  description:
    "On-chain format for a BitPlan draft: BPLN framing, public headers, and encrypted bodies.",
  title: "Envelopes",
};

const LAYOUT = [
  { field: "magic", size: "4 bytes", value: "ASCII BPLN" },
  { field: "version", size: "1 byte", value: "0x01 private / 0x02 shared" },
  {
    field: "header size",
    size: "4 bytes",
    value: "uint32-LE length of the header JSON",
  },
  { field: "header", size: "varies", value: "UTF-8 JSON" },
  {
    field: "ciphertext",
    size: "rest",
    value: "private ciphertext, or shared payload followed by wrapped keys",
  },
] as const;

export default function EnvelopePage() {
  return (
    <>
      <h1>Envelopes</h1>
      <p>
        The envelope packages encrypted data so another BitPlan reader can open
        it. It provides framing and public decryption parameters; encryption
        protects the plan inside it. Anything that can read a 1Sat Ordinal and
        talk to a BRC-100 wallet can implement the format.
      </p>
      <section id="where-it-lives">
        <h2>Where it lives</h2>
        <p>
          Content type is <code>application/x-bitplan</code>. Cleartext MAP on
          chain is three fields:{" "}
          <code>{`{ "app": "bitplan", "type": "plan", "enc": "1" }`}</code>.
          Titles, descriptions, and git provenance stay inside the ciphertext.
        </p>
      </section>
      <section id="versioning">
        <h2>Versioning</h2>
        <p>
          The first publish inscribes a 1-satoshi output. Later publishes spend
          that satoshi back to you with a new envelope. The origin (genesis
          outpoint) is the draft&apos;s identity. Only the wallet holding the
          coin can publish the next version.
        </p>
      </section>
      <section id="binary-layout">
        <h2>Binary layout</h2>
        <p>
          Multi-byte integers are little-endian. A reader must reject anything
          whose magic is not BPLN, whose version it does not implement, whose
          header size overruns the buffer, or that carries no ciphertext.
        </p>
        <div className="not-typeset mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LAYOUT.map((row) => (
                <TableRow key={row.field}>
                  <TableCell className="font-mono text-xs">
                    {row.field}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {row.size}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {row.value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <section id="content-key">
        <h2>Private</h2>
        <p>
          The header names the fixed <code>[2, &quot;bitplan&quot;]</code>
          protocol and <code>keyID</code>. The wallet derives the encryption key
          internally and encrypts the complete plan with{" "}
          <code>counterparty: &quot;self&quot;</code>. The <code>keyID</code> is
          a public derivation label, not key material.
        </p>
      </section>
      <section id="sharing">
        <h2>Shared</h2>
        <p>
          The SDK encrypts the plan once with a fresh random 32-byte key and
          AES-256-GCM. The wallet encrypts that key for the owner and each
          reader. A reader asks their wallet for their copy, then decrypts the
          plan locally. Identity keys are public; private keys stay in the
          wallet. The SDK gets the document key and each IV from the operating
          system&apos;s secure random generator and fails if none is available.
          Each IV is 32 bytes.
        </p>
      </section>
      <section id="security">
        <h2>Security properties</h2>
        <p>
          AES-GCM provides confidentiality and tamper detection. The wallet will
          fail on the wrong protocol, <code>keyID</code>, counterparty, or
          ciphertext. A shared payload includes a SHA-256 commitment to its
          canonical header. It detects changes made without the document key.
          The envelope does not prove authorship by itself; the ordinal&apos;s
          origin and transaction chain do that.
        </p>
      </section>
    </>
  );
}
