import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanAccessPanel } from "./plan-access-panel";
import {
  defaultRevisionSharing,
  RevisionSharingProvider,
} from "./revision-sharing";

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
  expect(contributor).toContain("PDF</button>");
  expect(contributor).not.toContain("revision-access");
  expect(contributor).not.toContain("Private copy");
  expect(render(true)).toContain("revision-access");
});

test("private access has one editable roster initialized from envelope recipients", () => {
  const recipients = [
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  ];
  expect(defaultRevisionSharing({ link: false, recipients })).toEqual({
    mode: "preserve",
    recipients,
  });
  expect(defaultRevisionSharing({ link: true, recipients }).recipients).toEqual(
    []
  );
  const html = renderToStaticMarkup(
    <RevisionSharingProvider
      currentAccess={{ link: false, recipients }}
      origin="h_test"
    >
      <PlanAccessPanel origin="h_test" publisher />
    </RevisionSharingProvider>
  );
  expect(html).toContain("1 identities · current");
  expect(html).toContain("Has current access");
  expect(html).toContain("Reset");
  expect(html).not.toContain('aria-label="Current recipients"');
  expect(html).toContain('aria-label="Add public key"');
  expect(html).not.toContain(
    '<summary class="cursor-pointer text-xs">Add public key'
  );
});
