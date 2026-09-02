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
  description:
    "bitplan CLI commands for publishing, reading, contacts, and teams.",
  title: "Commands",
};

const FLAGS = [
  {
    command: "upload <file>",
    flags:
      "--draft <origin>, --new, --description <text>, --share-with <identity-key|contact|team>, --private, --link, --hosted, --no-relay, -y, --json, --allow-finding <id>",
  },
  {
    command: "inscribe <h_id|file>",
    flags: "--all-versions, --wallet-url <url>, --site-url <url>, -y, --json",
  },
  {
    command: "list",
    flags: "--json, -v/--verbose, --limit <n>",
  },
  {
    command: "fetch <origin|url>",
    flags: "--meta, --json, --version <n>",
  },
  {
    command: "auth / whoami",
    flags: "--wallet-url <url>, --json on whoami",
  },
  {
    command: "config",
    flags: "--share-with <identity-key|contact|team>, --clear-share-with",
  },
  {
    command: "contact",
    flags: "set <name> <identity-key>, remove <name>, list [--json]",
  },
  {
    command: "team",
    flags:
      "set <name> <contacts...>, add <name> <contacts...>, remove <name> <contacts...>, delete <name>, list [name] [--json]",
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
        <code>--link</code>: Add a reader link anyone can open; kept on later
        versions until --private.
      </p>
      <p>
        <code>--hosted</code> stores the sealed envelope on bitplan.dev instead
        of the chain. <code>bitplan inscribe &lt;h_id|file&gt;</code> publishes
        it on chain; <code>--all-versions</code> replays the whole history.
      </p>
      <p>
        <code>--share-with</code> accepts a public identity key, contact, or
        team. <code>config --share-with</code> saves the choice as a default for
        new plans. Use <code>config --clear-share-with</code> to clear it.
      </p>
      <p>
        Contact names, their public keys, and team membership are defined in{" "}
        <code>~/.bitplan/config.json</code>. A local draft may remember a name
        so it can resolve the current members when you publish. Neither names
        nor membership go to BitPlan servers or on-chain; only public identity
        keys appear in the shared envelope. BitPlan has no accounts, team
        directory, or plan database.
      </p>
      <p>
        Removing a team member excludes them from the next version of locally
        tracked plans that remember that team. It cannot remove access to
        versions already shared with them.
      </p>
      <p>
        <code>fetch --meta</code> writes metadata to stderr, including whether
        the envelope is private or shared and the public reader list. HTML
        remains on stdout so it can be redirected to a file.
      </p>
      <p>
        Agents and scripts can use <code>upload --yes --json</code> or{" "}
        <code>fetch --json</code> to receive one JSON value. JSON output never
        counts as permission to publish; upload still requires the explicit{" "}
        <code>--yes</code> flag and wallet approval.
      </p>
      <p>
        By default, <code>upload</code> sends the wallet-returned Atomic BEEF to
        1Sat after publishing. 1Sat attempts to capture it for OrdFS and
        forwards the transaction to Arcade, which can make the viewer available
        sooner. Relay failure is a warning; it does not undo the wallet publish.
        Pass <code>--no-relay</code> to opt out.
      </p>
      <p>
        On-chain bytes are documented in the{" "}
        <Link href="/docs/envelope">envelope spec</Link>.
      </p>
    </>
  );
}
