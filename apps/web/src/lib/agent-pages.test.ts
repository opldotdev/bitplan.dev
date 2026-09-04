import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GET as getRobots } from "@/app/robots.txt/route";

import { LLMS_TXT, markdownForPath, markdownNotFound } from "./agent-pages";

const SEMVER = /^\d+\.\d+\.\d+$/;
const SKILL_METADATA_VERSION = /\nmetadata:\n\s+version: ["']([^"']+)["']/;
const SKILL_VISIBLE_VERSION = /\*\*Skill version: ([^*]+)\*\*/;

describe("agent pages", () => {
  test("home and docs have markdown", () => {
    expect(markdownForPath("/")).toContain("npx bitplan");
    expect(markdownForPath("/docs")).toContain("Docs");
    expect(markdownForPath("/docs/")).toContain("Docs");
    expect(markdownForPath("/docs/agents")).toContain(
      "Never give an agent a wallet mnemonic"
    );
    expect(markdownForPath("/docs/agents")).toContain(
      "npx bitplan config --share-with"
    );
    expect(markdownForPath("/docs/agents")).toContain(
      "npx bitplan team add acme-dev alice"
    );
    expect(markdownForPath("/docs/agents")).toContain(
      "only public identity keys appear in the shared envelope"
    );
    expect(markdownForPath("/docs/commands")).toContain(
      "npx bitplan contact list"
    );
    expect(markdownForPath("/docs/commands")).toContain(
      "npx bitplan team delete <name>"
    );
    expect(markdownForPath("/new")).toContain("prepare_bitplan_plan");
    expect(markdownForPath("/new")).toContain("list_my_bitplans");
  });

  test("unknown paths have no markdown page", () => {
    expect(markdownForPath("/nope")).toBeNull();
  });

  test("llms.txt names the CLI and when to use BitPlan", () => {
    expect(LLMS_TXT).toContain("When to use this");
    expect(LLMS_TXT).toContain("npx bitplan");
    expect(LLMS_TXT).toContain("https://www.npmjs.com/package/bitplan");
    expect(LLMS_TXT).toContain("/ordfs/content/");
  });

  test("not-found markdown points at docs, sitemap, and llms.txt", () => {
    expect(markdownNotFound()).toContain("/docs");
    expect(markdownNotFound()).toContain("/sitemap.xml");
    expect(markdownNotFound()).toContain("/llms.txt");
  });

  test("agent discovery files describe real BitPlan capabilities", async () => {
    const publicRoot = new URL("../../public/.well-known/", import.meta.url);
    const publishedSkill = await readFile(
      new URL("agent-skills/bitplan/SKILL.md", publicRoot),
      "utf8"
    );
    const canonicalSkill = await readFile(
      new URL("../../../../skills/bitplan/SKILL.md", import.meta.url),
      "utf8"
    );
    const index = JSON.parse(
      await readFile(new URL("agent-skills/index.json", publicRoot), "utf8")
    ) as { $schema: string; skills: Array<{ digest: string }> };
    const catalog = JSON.parse(
      await readFile(new URL("ai-catalog.json", publicRoot), "utf8")
    ) as { entries: Array<{ data?: unknown; url?: unknown }> };
    const digest = createHash("sha256").update(canonicalSkill).digest("hex");

    expect(index.$schema).toBe(
      "https://schemas.agentskills.io/discovery/0.2.0/schema.json"
    );
    expect(index.skills[0].digest).toBe(`sha256:${digest}`);
    expect(publishedSkill).toBe(canonicalSkill);
    expect(catalog.entries).toHaveLength(2);
    expect(
      catalog.entries.every(
        (entry) => (entry.url === undefined) !== (entry.data === undefined)
      )
    ).toBe(true);

    const robots = await (await getRobots()).text();
    expect(robots).toContain(
      "Content-Signal: ai-train=no, search=yes, ai-input=yes"
    );
    expect(robots).toContain(
      "Agentmap: https://bitplan.dev/.well-known/ai-catalog.json"
    );
  });

  test("cross-harness plugin manifests expose the canonical skill", async () => {
    const repoRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../.."
    );
    const versions = new Set<string>();
    const canonicalSkill = await readFile(
      resolve(repoRoot, "skills/bitplan/SKILL.md"),
      "utf8"
    );
    const metadataVersion = canonicalSkill.match(SKILL_METADATA_VERSION)?.[1];
    const visibleVersion = canonicalSkill.match(SKILL_VISIBLE_VERSION)?.[1];
    const manifests = await Promise.all(
      [".claude-plugin", ".codex-plugin", ".grok-plugin"].map(
        async (directory) =>
          JSON.parse(
            await readFile(resolve(repoRoot, directory, "plugin.json"), "utf8")
          ) as { name: string; skills: string; version: string }
      )
    );
    for (const manifest of manifests) {
      expect(manifest.name).toBe("bitplan");
      expect(manifest.skills).toBe("./skills/");
      expect(manifest.version).toMatch(SEMVER);
      versions.add(manifest.version);
    }
    expect(versions.size).toBe(1);
    expect(metadataVersion).toBe(manifests[0].version);
    expect(visibleVersion).toBe(manifests[0].version);
  });
});
