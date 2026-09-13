import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanAccessPanel } from "./plan-access-panel";
import { RevisionSharingProvider } from "./revision-sharing";

test("contributors see actual access but cannot configure next-revision recipients", () => {
  const render = (publisher: boolean) =>
    renderToStaticMarkup(
      <RevisionSharingProvider
        currentAccess={{ link: true, recipients: [] }}
        origin="h_test"
      >
        <PlanAccessPanel origin="h_test" publisher={publisher} />
      </RevisionSharingProvider>
    );
  const contributor = render(false);
  expect(contributor).toContain("Anyone with the full link");
  expect(contributor).toContain("Copy plan link");
  expect(contributor).toContain("Save as PDF");
  expect(contributor).not.toContain("revision-access");
  expect(contributor).not.toContain("Private copy");
  expect(render(true)).toContain("revision-access");
});
