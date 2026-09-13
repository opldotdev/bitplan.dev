import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanRevisions } from "./plan-revisions";

test("revision navigation stays disabled until access has been checked", () => {
  const markup = renderToStaticMarkup(
    <PlanRevisions
      currentVersion={2}
      latestVersion={3}
      onVersion={() => undefined}
      origin="h_test"
    />
  );
  expect(markup).toContain("Viewing now");
  expect(markup).toContain("Checking access");
  expect(markup.match(/disabled=""/g)?.length).toBe(3);
  expect(markup.indexOf("Version 3")).toBeLessThan(markup.indexOf("Version 1"));
});
