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
      "--draft <origin>, --new, --description <text>, -y, --allow-finding <id>",
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
        On-chain bytes are documented in the{" "}
        <Link href="/docs/envelope">envelope spec</Link>.
      </p>
    </>
  );
}
