import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  PLAN_APPEARANCES,
  parsePlanAppearance,
  planAppearanceCss,
} from "./plan-appearance";

test("appearance presets emit only validated local styles and support both themes", () => {
  for (const preset of PLAN_APPEARANCES) {
    expect(parsePlanAppearance(preset)).toEqual(preset);
    const css = planAppearanceCss(preset);
    expect(css).toContain("prefers-color-scheme:dark");
    expect(css).not.toContain("https:");
    expect(css).not.toContain("display:none");
  }
  expect(() =>
    parsePlanAppearance({ ...PLAN_APPEARANCES[0], layout: "external" })
  ).toThrow();
  expect(() =>
    parsePlanAppearance({
      ...PLAN_APPEARANCES[0],
      light: {
        ...PLAN_APPEARANCES[0].light,
        paper: "url(https://example.com)",
      },
    })
  ).toThrow();
});

test("blank is an empty theme-aware starter and does not hide existing content", async () => {
  const preset = PLAN_APPEARANCES.find((item) => item.layout === "blank");
  expect(preset).toBeDefined();
  if (!preset) {
    throw new Error("Blank appearance is missing.");
  }
  const css = planAppearanceCss(preset);
  expect(css).toContain("#ffffff");
  expect(css).toContain("#202522");
  expect(css).not.toContain("data:image");
  expect(css).not.toContain("display:none");
  const html = await readFile(
    new URL("../../../../docs/templates/blank.html", import.meta.url),
    "utf8"
  );
  expect(html).toContain('id="blank-page"');
  expect(html).toContain('aria-label="Blank page for annotations"></main>');
  expect(
    await readFile(
      new URL("../../public/templates/blank.html", import.meta.url),
      "utf8"
    )
  ).toBe(html);
});
