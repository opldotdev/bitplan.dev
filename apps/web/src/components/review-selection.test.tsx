import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewSelection } from "./review-selection";

test("review selection exposes its state without native checkboxes", () => {
  for (const included of [true, false]) {
    const markup = renderToStaticMarkup(
      <ReviewSelection included={included} onToggle={() => undefined} />
    );
    expect(markup).toContain(`aria-pressed="${included}"`);
    expect(markup).toContain(included ? "Included" : "Skipped");
    expect(markup).not.toContain('type="checkbox"');
  }
});
