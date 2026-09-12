"use client";

import { CommandCopy } from "@/components/command-copy";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The `skills` CLI installs into each agent's own skills directory. The agent
 * keys below are the ones that CLI publishes; the labels are its display names.
 */
const AGENTS = [
  { key: "claude-code", label: "Claude Code" },
  { key: "codex", label: "Codex" },
  { key: "grok", label: "Grok Build" },
  { key: "opencode", label: "OpenCode" },
  { key: "cursor", label: "Cursor" },
  { key: "*", label: "All" },
] as const;

function command(agent: string): string {
  return `npx skills add opldotdev/bitplan.dev -s bitplan -a ${agent === "*" ? "'*'" : agent} -g`;
}

export function SkillInstall() {
  return (
    <Tabs className="gap-4" defaultValue={AGENTS[0].key}>
      {/* The list is wider than a phone; scroll it from its own left edge
          rather than letting `w-fit` centering clip the first tab. */}
      <div className="overflow-x-auto pb-1">
        <TabsList className="mx-auto w-max" variant="line">
          {AGENTS.map((agent) => (
            <TabsTrigger key={agent.key} value={agent.key}>
              {agent.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {AGENTS.map((agent) => (
        <TabsContent key={agent.key} value={agent.key}>
          <div className="text-left">
            <CommandCopy command={command(agent.key)} />
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
