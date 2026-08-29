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
    "On-chain format for a bitplan draft: BPLN envelope, MAP fields, and BRC-2 ciphertext.",
  title: "Envelope",
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
    value: "document ciphertext, then wrapped document keys",
  },
] as const;

export default function EnvelopePage() {
  return (
    <>
      <h1>Envelope</h1>
      <p>
        This is the on-chain format bitplan publishes. Anything that can read a
        1Sat Ordinal and talk to a BRC-100 wallet can implement it. The body is
        either wallet BRC-2 ciphertext or an SDK-encrypted payload with BRC-2
        key wraps. There is no cleartext path.
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
        <h2>BRC-2</h2>
        <p>
          The header names the fixed <code>[2, &quot;bitplan&quot;]</code>
          protocol and keyID. Private v1 contains one{" "}
          <code>wallet.encrypt</code> result with{" "}
          <code>counterparty: &quot;self&quot;</code>. Shared v2 contains one
          document encrypted by the SDK&apos;s AES-GCM <code>SymmetricKey</code>
          , then uses the wallet to wrap only that key for each reader. The CLI
          never receives an identity private key or implements its own cipher.
        </p>
      </section>
      <section id="sharing">
        <h2>Shared readers</h2>
        <p>
          A v2 header records the payload length, publisher identity key, and a
          wrapped-key range for each reader. A recipient asks its wallet to
          unwrap its range with the publisher as counterparty, then decrypts the
          one payload locally. Identity keys and the access list are public; the
          document and its key remain encrypted.
        </p>
      </section>
    </>
  );
}
