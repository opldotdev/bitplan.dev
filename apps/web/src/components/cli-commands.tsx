import { CommandCopy } from "@/components/command-copy";

const COMMANDS = [
  {
    cmd: "npx bitplan upload ./plan.html",
    hint: "Publish a draft. bunx bitplan works the same.",
  },
  {
    cmd: 'npx bitplan upload ./plan.html --description "migration, phase one"',
    hint: "Optional label, shown in list and My drafts.",
  },
  {
    cmd: "npx bitplan list",
    hint: "Drafts this wallet holds.",
  },
  {
    cmd: "npx bitplan whoami",
    hint: "Check the wallet.",
  },
  {
    cmd: "npx bitplan fetch <origin>",
    hint: "Decrypt HTML to stdout.",
  },
] as const;

export function CliCommands() {
  return (
    <ol className="space-y-4">
      {COMMANDS.map((item) => (
        <li className="space-y-1.5" key={item.cmd}>
          <CommandCopy command={item.cmd} />
          <p className="text-muted-foreground text-sm">{item.hint}</p>
        </li>
      ))}
    </ol>
  );
}
