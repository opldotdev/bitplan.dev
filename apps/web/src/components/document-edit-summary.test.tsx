import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentEditSummary } from "./document-edit-summary";

test("document edits show attributed patches, HTML replacements, and deletion", () => {
  const block = {
    base: {
      origin: "h_V2AE7cudMqACIdoFBJv2",
      sha256: "a".repeat(64),
      version: 1,
    },
    original: "Before",
    participantId: "tina",
    path: "body>p:nth-child(1)",
    revision: 1,
    roomId: "room",
    schema: "bitplan-text/1" as const,
    sequence: 1,
    sessionId: "browser",
    text: "<script>literal</script>",
  };
  const markup = renderToStaticMarkup(
    <DocumentEditSummary
      blocks={[block]}
      htmlRevision={3}
      profiles={{ tina: { name: "Tina" } }}
    />
  );
  expect(markup).toContain("Document edits");
  expect(markup).toContain("Edited by Tina");
  expect(markup).toContain("Shared HTML replacement");
  expect(markup).toContain("&lt;script&gt;literal&lt;/script&gt;");
  expect(markup).not.toContain("<script>");
  expect(markup).not.toContain("Consider all");
  const publisher = renderToStaticMarkup(
    <DocumentEditSummary blocks={[block]} onConsiderAll={() => undefined} />
  );
  expect(publisher).toContain("Consider all");
  expect(publisher).toContain("Consider none");
  expect(
    renderToStaticMarkup(
      <DocumentEditSummary blocks={[{ ...block, deleted: true }]} />
    )
  ).toContain("Removed from the shared document");
  expect(renderToStaticMarkup(<DocumentEditSummary blocks={[]} />)).toBe("");
  const actions = { onRevert: () => undefined, onToggle: () => undefined };
  expect(
    renderToStaticMarkup(
      <DocumentEditSummary
        blocks={[block]}
        currentParticipantId="bob"
        {...actions}
      />
    )
  ).not.toContain('aria-label="Restore original passage"');
  expect(
    renderToStaticMarkup(
      <DocumentEditSummary
        blocks={[block]}
        currentParticipantId="tina"
        {...actions}
      />
    )
  ).toContain('aria-label="Restore original passage"');
  expect(
    renderToStaticMarkup(
      <DocumentEditSummary
        blocks={[block, { ...block, participantId: "bob", revision: 2 }]}
        currentParticipantId="tina"
        {...actions}
      />
    )
  ).not.toContain('aria-label="Restore original passage"');
});
