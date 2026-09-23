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
    expect(markdownForPath("/docs/agents")).toContain("/docs/sharing");
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

  test("sharing guide distinguishes document, room, and update authority", async () => {
    const markdown = markdownForPath("/docs/sharing");
    expect(markdown).toContain("Connecting a wallet does not re-encrypt");
    expect(markdown).toContain("Old links can still decrypt old versions");
    expect(markdown).toContain("Omitting --link preserves inherited readers");
    expect(markdown).toContain(
      "Browser starters do not retain the hosted update secret"
    );
    expect(markdown).toContain("Wallet-only room membership");
    const page = await readFile(
      new URL("../app/docs/sharing/page.tsx", import.meta.url),
      "utf8"
    );
    expect(page).toContain("Two encrypted layers");
    expect(page).toContain("--private");
    expect(page).toContain("--share-with project");
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
    ) as {
      $schema: string;
      skills: Array<{ name: string; digest: string }>;
    };
    const catalog = JSON.parse(
      await readFile(new URL("ai-catalog.json", publicRoot), "utf8")
    ) as { entries: Array<{ data?: unknown; url?: unknown }> };
    const digest = createHash("sha256").update(canonicalSkill).digest("hex");
    const publishedGateway = await readFile(
      new URL("agent-skills/gateway/SKILL.md", publicRoot),
      "utf8"
    );
    const canonicalGateway = await readFile(
      new URL("../../../../skills/gateway/SKILL.md", import.meta.url),
      "utf8"
    );
    const gatewayDigest = createHash("sha256")
      .update(canonicalGateway)
      .digest("hex");
    const bitplan = index.skills.find((skill) => skill.name === "bitplan");
    const gateway = index.skills.find((skill) => skill.name === "gateway");

    expect(index.$schema).toBe(
      "https://schemas.agentskills.io/discovery/0.2.0/schema.json"
    );
    expect(bitplan?.digest).toBe(`sha256:${digest}`);
    expect(publishedSkill).toBe(canonicalSkill);
    expect(gateway?.digest).toBe(`sha256:${gatewayDigest}`);
    expect(publishedGateway).toBe(canonicalGateway);
    expect(canonicalGateway).toContain("evaluate");
    expect(canonicalGateway).toContain("@bitplan.dev");
    expect(canonicalGateway).toContain("PAYMENT-SIGNATURE");
    expect(canonicalGateway).toContain("byok_fee_bps");
    expect(canonicalGateway).not.toContain("0.5 BSV");
    expect(canonicalGateway).not.toContain("@gateway.bitplan.dev");
    expect(canonicalGateway).not.toContain("30%");
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

  test("Codex plugin ships identical 512×512 logo and composer icon", async () => {
    const repoRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../.."
    );
    const manifest = JSON.parse(
      await readFile(resolve(repoRoot, ".codex-plugin/plugin.json"), "utf8")
    ) as {
      interface?: { composerIcon?: string; logo?: string };
    };
    expect(manifest.interface?.composerIcon).toBe("./assets/icon.png");
    expect(manifest.interface?.logo).toBe("./assets/logo.png");

    const logo = await readFile(resolve(repoRoot, "assets/logo.png"));
    const icon = await readFile(resolve(repoRoot, "assets/icon.png"));
    expect(logo.equals(icon)).toBe(true);
    expect(logo[0]).toBe(0x89);
    expect(logo[1]).toBe(0x50);
    expect(logo[2]).toBe(0x4e);
    expect(logo[3]).toBe(0x47);
    const view = new DataView(logo.buffer, logo.byteOffset, logo.byteLength);
    expect(view.getUint32(16)).toBe(512);
    expect(view.getUint32(20)).toBe(512);
  });
});
