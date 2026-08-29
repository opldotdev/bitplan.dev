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
    flags: "--json, --limit <n>",
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
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="font-heading font-semibold text-3xl tracking-tight">
          Commands
        </h1>
        <p className="text-muted-foreground">
          Every command is the same on{" "}
          <code className="font-mono text-sm">npx bitplan</code> and{" "}
          <code className="font-mono text-sm">bunx bitplan</code>.
        </p>
      </div>

      <CliCommands />

      <section className="space-y-3">
        <h2 className="font-heading font-medium text-lg tracking-tight">
          Flags
        </h2>
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
      </section>

      <p className="text-muted-foreground text-sm">
        On-chain bytes are documented in the{" "}
        <Link
          className="text-primary underline-offset-4 hover:underline"
          href="/docs/envelope"
        >
          envelope spec
        </Link>
        .
      </p>
    </div>
  );
}
