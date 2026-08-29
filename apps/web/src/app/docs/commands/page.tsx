import type { Metadata } from "next";
import Link from "next/link";

import { CliCommands } from "@/components/cli-commands";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  description: "bitplan CLI commands for upload, list, fetch, and whoami.",
  title: "Commands",
};

const FLAGS = [
  {
    command: "upload <file>",
    flags:
      "--draft <origin>, --new, --description <text>, --share-with <identity-key>, --private, -y, --allow-finding <id>",
  },
  {
    command: "list",
    flags: "--json, -v/--verbose, --limit <n>",
  },
  {
    command: "fetch <origin|url>",
    flags: "--meta, --version <n>",
  },
  {
    command: "auth / whoami",
    flags: "--wallet-url <url>, --json on whoami",
  },
  {
    command: "version",
    flags: "prints the installed CLI version",
  },
] as const;

export default function CommandsPage() {
  return (
    <>
      <h1>Commands</h1>
      <p>
        Every command is the same on <code>npx bitplan</code> and{" "}
        <code>bunx bitplan</code>.
      </p>
      <div className="not-typeset mt-6">
        <CliCommands />
      </div>
      <section id="flags">
        <h2>Flags</h2>
        <div className="not-typeset mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Command</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FLAGS.map((row) => (
                <TableRow key={row.command}>
                  <TableCell className="font-mono text-xs">
                    {row.command}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {row.flags}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <p>
        <code>--share-with</code> is repeatable and additive, up to 128 readers.
        It publishes one encrypted document plus a small wallet-wrapped key per
        identity. <code>--private</code> makes only the new version wallet-only;
        older shared versions cannot be revoked. Shared drafts require CLI
        0.0.6+ or the current website to read.
      </p>
      <p>
        <code>fetch --meta</code> writes metadata to stderr, including whether
        the envelope is private or shared and the public reader list. HTML
        remains on stdout so it can be redirected to a file.
      </p>
      <p>
        On-chain bytes are documented in the{" "}
        <Link href="/docs/envelope">envelope spec</Link>.
      </p>
    </>
  );
}
