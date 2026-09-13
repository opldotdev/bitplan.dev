import { expect, test } from "bun:test";
import { openEnvelope } from "./envelope";
import { prepareStarterDraft } from "./instant-draft";
import { linkWallet } from "./link-reader";
import { saveHostedVersion } from "./save-hosted-version";

test("hosted save preserves readers, pins the base version, and refuses missing authority or changed review", async () => {
  const wallet = linkWallet("11".repeat(32));
  const reader = linkWallet("22".repeat(32));
  const readerKey = (await reader.getPublicKey({ identityKey: true }))
    .publicKey;
  const plaintext = await prepareStarterDraft(
    { layout: "brief", title: "Reviewed" },
    (async () =>
      new Response(
        '<html data-bitplan-template="brief"><p>Revised</p></html>',
        { headers: { "content-type": "text/html" } }
      )) as typeof fetch
  );
  let requests = 0;
  const fetchImpl = (async (_url, init) => {
    requests += 1;
    expect(new Headers(init?.headers).get("x-bitplan-base-version")).toBe("1");
    const bytes = new Uint8Array(init?.body as ArrayBuffer);
    expect((await openEnvelope(reader, bytes)).plaintext.html).toContain(
      "Revised"
    );
    return Response.json({ id: "h_abcdefghijklmnopqrst", version: 2 });
  }) as typeof fetch;
  const input = {
    assertCurrent: () => {
      /* Frozen review remains current in this fixture. */
    },
    id: "h_abcdefghijklmnopqrst",
    plaintext,
    recipients: [readerKey],
    version: 1,
    wallet,
  };
  const storage = { getItem: () => "a".repeat(43) };
  expect(await saveHostedVersion(input, fetchImpl, storage)).toBe(2);
  await expect(
    saveHostedVersion(input, fetchImpl, { getItem: () => null })
  ).rejects.toThrow("update permission");
  await expect(
    saveHostedVersion(
      {
        ...input,
        assertCurrent: () => {
          throw new Error("Changed");
        },
      },
      fetchImpl,
      storage
    )
  ).rejects.toThrow("Changed");
  expect(requests).toBe(1);
  await expect(
    saveHostedVersion(
      input,
      (async () => new Response(null, { status: 409 })) as typeof fetch,
      storage
    )
  ).rejects.toThrow("newer version");
});
