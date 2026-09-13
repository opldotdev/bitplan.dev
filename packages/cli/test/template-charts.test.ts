import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { validateHtml } from "../src/htmlPolicy";

test("all populated templates embed accessible local charts and the shared DOM explanation", () => {
  for (const name of ["brief", "terminal", "decision", "plan", "proposal", "editorial", "components"]) {
    const html = readFileSync(new URL(`../../../docs/templates/${name}.html`, import.meta.url), "utf8");
    const publicHtml = readFileSync(new URL(`../../../apps/web/public/templates/${name}.html`, import.meta.url), "utf8");
    const block = /<!-- bitplan-visuals:start -->[\s\S]*?<!-- bitplan-visuals:end -->/;
    expect(html.match(block)?.[0]).toBe(publicHtml.match(block)?.[0]);
    expect(validateHtml(html).ok).toBe(true);
    expect(validateHtml(publicHtml).ok).toBe(true);
    expect(html.match(/id="shared-planning"/g)?.length).toBe(1);
    expect(html).toContain("data-bp-trend-data");
    expect(html).toContain("data-bp-mix-data");
    expect(html).toContain("not BitPlan analytics");
    expect(html).toContain("HTML overlay");
    for (const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(script!)).not.toThrow();
  }
  const blank = readFileSync(new URL("../../../docs/templates/blank.html", import.meta.url), "utf8");
  expect(blank).not.toContain("data-bp-trend-data");
});
