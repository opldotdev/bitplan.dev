import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { GET as getRobots } from "@/app/robots.txt/route";

import { LLMS_TXT, markdownForPath, markdownNotFound } from "./agent-pages";

describe("agent pages", () => {
  test("home and docs have markdown", () => {
    expect(markdownForPath("/")).toContain("npx bitplan");
    expect(markdownForPath("/docs")).toContain("Docs");
    expect(markdownForPath("/docs/")).toContain("Docs");
    expect(markdownForPath("/docs/api")).toContain("Sunset");
    expect(markdownForPath("/new")).toContain("prepare_bitplan_plan");
  });

  test("unknown paths have no markdown page", () => {
    expect(markdownForPath("/nope")).toBeNull();
  });

  test("llms.txt names the CLI and when to use BitPlan", () => {
    expect(LLMS_TXT).toContain("When to use this");
    expect(LLMS_TXT).toContain("npx bitplan");
    expect(LLMS_TXT).toContain("https://www.npmjs.com/package/bitplan");
    expect(LLMS_TXT).toContain("/api/v1/content/");
  });

  test("not-found markdown points at docs, sitemap, and llms.txt", () => {
    expect(markdownNotFound()).toContain("/docs");
    expect(markdownNotFound()).toContain("/sitemap.xml");
    expect(markdownNotFound()).toContain("/llms.txt");
    expect(markdownNotFound()).toContain("/openapi.json");
  });

  test("agent discovery files describe real BitPlan capabilities", async () => {
    const publicRoot = new URL("../../public/.well-known/", import.meta.url);
    const skill = await readFile(
      new URL("agent-skills/bitplan/SKILL.md", publicRoot),
      "utf8"
    );
    const index = JSON.parse(
      await readFile(new URL("agent-skills/index.json", publicRoot), "utf8")
    ) as { $schema: string; skills: Array<{ digest: string }> };
    const catalog = JSON.parse(
      await readFile(new URL("ai-catalog.json", publicRoot), "utf8")
    ) as { entries: Array<{ data?: unknown; url?: unknown }> };
    const digest = createHash("sha256").update(skill).digest("hex");

    expect(index.$schema).toBe(
      "https://schemas.agentskills.io/discovery/0.2.0/schema.json"
    );
    expect(index.skills[0].digest).toBe(`sha256:${digest}`);
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
});
