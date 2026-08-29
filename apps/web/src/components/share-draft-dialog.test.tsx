import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ShareDraftDialog } from "./share-draft-dialog";

describe("ShareDraftDialog", () => {
  test("renders a stock-dialog trigger in the decrypted plan toolbar", () => {
    const markup = renderToStaticMarkup(
      <ShareDraftDialog origin={`${"a".repeat(64)}_0`} />
    );

    expect(markup).toContain("Share");
    expect(markup).toContain('data-slot="dialog-trigger"');
  });
});
