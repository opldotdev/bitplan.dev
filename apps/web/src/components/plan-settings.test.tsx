import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanSettings } from "./plan-settings";

test("preferences render within the host menu, without another dialog or publish detour", () => {
  const render = (section: string) =>
    renderToStaticMarkup(
      <PlanSettings
        browserMenu={false}
        details={<p>Version details</p>}
        interaction={<button type="button">Compare original</button>}
        onBrowserMenuChange={() => undefined}
        section={section}
      />
    );
  const interaction = render("Interaction");
  expect(interaction).toContain("Keyboard shortcuts");
  expect(interaction).toContain("Undo removal");
  expect(interaction).not.toContain('role="dialog"');
  expect(interaction).not.toContain("Open Publish");
  expect(render("Sound")).toContain("UI sound volume");
  expect(render("Sound")).not.toContain("Keyboard shortcuts");
  expect(render("Document details")).toContain("Version details");
  expect(render("Appearance")).toContain("Color mode");
});
