import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WalletSettings } from "./wallet-settings";

test("wallet settings never offer a fabricated or cached reader identity before connection", () => {
  const html = renderToStaticMarkup(<WalletSettings />);
  expect(html).toContain("Not connected");
  expect(html).toContain("Connect wallet");
  expect(html).not.toContain("Copy public identity key");
});
