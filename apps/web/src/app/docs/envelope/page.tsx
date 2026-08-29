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
    "On-chain format for a bitplan draft: BPLN envelope, MAP fields, and AES-256-GCM ciphertext.",
  title: "Envelope",
};

const LAYOUT = [
  { field: "magic", size: "4 bytes", value: "ASCII BPLN" },
  { field: "version", size: "1 byte", value: "0x01" },
  {
    field: "header size",
    size: "4 bytes",
    value: "uint32-LE length of the header JSON",
  },
  { field: "header", size: "varies", value: "UTF-8 JSON" },
  {
    field: "ciphertext",
    size: "rest",
    value: "AES-256-GCM, authentication tag appended",
  },
] as const;

export default function EnvelopePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="font-heading font-semibold text-3xl tracking-tight">
          Envelope
        </h1>
        <p className="text-muted-foreground">
          This is the on-chain format bitplan publishes. Anything that can read
          a 1Sat Ordinal and talk to a BRC-100 wallet can implement it. v1 is
          encrypted only. A conforming implementation must not add a cleartext
          path.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-heading font-medium text-lg tracking-tight">
          Where it lives
        </h2>
        <p className="text-muted-foreground text-sm">
          Content type is{" "}
          <code className="font-mono">application/x-bitplan</code>. Cleartext
          MAP on chain is three fields:{" "}
          <code className="font-mono">
            {`{ "app": "bitplan", "type": "plan", "enc": "1" }`}
          </code>
          . Titles, descriptions, and git provenance stay inside the ciphertext.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-medium text-lg tracking-tight">
          Versioning
        </h2>
        <p className="text-muted-foreground text-sm">
          The first publish inscribes a 1-satoshi output. Later publishes spend
          that satoshi back to you with a new envelope. The origin (genesis
          outpoint) is the draft&apos;s identity. Only the wallet holding the
          coin can publish the next version.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-medium text-lg tracking-tight">
          Binary layout
        </h2>
        <p className="text-muted-foreground text-sm">
          Multi-byte integers are little-endian. A reader must reject anything
          whose magic is not BPLN, whose version it does not implement, whose
          header size overruns the buffer, or that carries no ciphertext.
        </p>
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
                <TableCell className="font-mono text-xs">{row.field}</TableCell>
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
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-medium text-lg tracking-tight">
          Content key
        </h2>
        <p className="text-muted-foreground text-sm">
          32 random bytes, fresh for every version, wrapped with{" "}
          <code className="font-mono">wallet.encrypt</code> under BRC-2{" "}
          <code className="font-mono">counterparty: &quot;self&quot;</code>. The
          wrapped key rides in the header. The raw key is never written to disk.
          Unwrap with the header&apos;s protocolID and keyID, not client
          constants.
        </p>
      </section>
    </div>
  );
}
