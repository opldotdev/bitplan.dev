import { CommandCopy } from "@/components/command-copy";

const COMMANDS = [
  {
    cmd: "npx bitplan upload ./plan.html",
    hint: "Publish a draft. bunx bitplan works the same.",
  },
  {
    cmd: "npx bitplan upload ./plan.html --no-relay",
    hint: "Skip the default 1Sat notification for this upload.",
  },
  {
    cmd: 'npx bitplan upload ./plan.html --description "migration, phase one"',
    hint: "Optional label, shown in list and My drafts.",
  },
  {
    cmd: "npx bitplan upload ./plan.html --share-with <identity-key>",
    hint: "Publish the next version for this wallet and the named reader.",
  },
  {
    cmd: "npx bitplan list",
    hint: "Drafts this wallet holds.",
  },
  {
    cmd: "npx bitplan whoami",
    hint: "Check the wallet and print its identity key.",
  },
  {
    cmd: "npx bitplan fetch <origin>",
    hint: "Decrypt HTML to stdout.",
  },
  {
    cmd: "npx bitplan version",
    hint: "Print the installed CLI version.",
  },
] as const;

export function CliCommands() {
  return (
    <ol className="flex flex-col gap-4">
      {COMMANDS.map((item) => (
        <li className="flex flex-col gap-1.5" key={item.cmd}>
          <CommandCopy command={item.cmd} />
          <p className="text-muted-foreground text-sm">{item.hint}</p>
        </li>
      ))}
    </ol>
  );
}
