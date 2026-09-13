import { expect, test } from "bun:test";
import {
  annotationPublicationPrompt,
  iterationPrompt,
  planAuthority,
  publicationPrompt,
  revisionSelectionPrompt,
} from "./plan-authority";

// Public secp256k1 test vectors, unrelated to any user's wallet.
const desktop =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const yours =
  "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const hosted = "h_abcdefghijklmnopqrst";
const chain = `${"a".repeat(64)}_0`;

test("contributor instructions preserve replies and cannot authorize publishing the document", () => {
  const review = {
    cursor: 4,
    notes: "",
    participantId: "alice",
    publishOnChain: true,
    target: { origin: hosted },
  };
  const prompt = annotationPublicationPrompt(hosted, review);
  expect(prompt).toContain("including my replies");
  expect(prompt).toContain("a hosted ID is not sufficient");
  expect(prompt).toContain("Do not silently publish their document");
  expect(prompt).toContain("explicit approval before signing or broadcasting");
  expect(
    annotationPublicationPrompt(hosted, { ...review, publishOnChain: false })
  ).toContain("hosted contributions only");
  expect(() =>
    annotationPublicationPrompt(hosted, { ...review, participantId: "" })
  ).toThrow();
});

test("publisher identity never substitutes for latest coin or hosted write authority", () => {
  expect(planAuthority(hosted, desktop, desktop, false)).toBe("publisher");
  expect(planAuthority(hosted, yours, desktop, true)).toBe("connected");
  expect(planAuthority(chain, desktop, desktop, false)).toBe("connected");
  expect(planAuthority(chain, yours, desktop, true)).toBe("owner");
  expect(planAuthority(chain, "invalid", desktop, true)).toBe("connected");
});

test("revision prompts freeze inclusion choices without granting destructive authority", () => {
  const review = {
    annotations: [{ id: "note-a", include: false, revision: 3 }],
    cursor: 12,
    documentRevision: 2,
    notes: "Keep the headline.",
    target: { origin: hosted, sha256: "a".repeat(64), version: 1 },
    textEdits: [
      {
        include: true,
        participantId: "tina",
        path: "body>p:nth-child(1)",
        revision: 4,
      },
    ],
  };
  const prompt = revisionSelectionPrompt(hosted, review);
  expect(prompt).toContain(JSON.stringify(review, null, 2));
  expect(prompt).toContain("Do not incorporate excluded suggestions");
  expect(prompt).toContain("Read baseHtml");
  expect(prompt).toContain("Preserve original annotation layers");
  expect(prompt).toContain("Requested destination: hosted draft only");
  const chainPrompt = revisionSelectionPrompt(hosted, {
    ...review,
    publishOnChain: true,
  });
  expect(chainPrompt).toContain("Requested destination: on-chain");
  expect(chainPrompt).toContain(
    "explicit approval before signing or broadcasting"
  );
  expect(chainPrompt).not.toContain("Requested destination: hosted draft only");
  expect(() => revisionSelectionPrompt(`${hosted}#k=secret`, review)).toThrow();
});

test("publication handoff preserves live layers and never copies credentials", () => {
  expect(iterationPrompt(hosted)).toContain("per-author textEdits");
  expect(iterationPrompt(hosted)).toContain("Ask me to review");
  expect(() => iterationPrompt(`${hosted}#k=secret`)).toThrow();
  expect(publicationPrompt(hosted, false)).toContain(
    "do not inscribe or spend BSV"
  );
  expect(publicationPrompt(chain, true)).toContain("approval before signing");
  expect(publicationPrompt(hosted, true)).toContain(
    "saved hosted-update authority"
  );
  expect(() => publicationPrompt(`${hosted}#k=secret`, false)).toThrow();
});

test("revision audience is explicit and only private-copy selections disclose recipient keys", () => {
  const review = {
    annotations: [],
    cursor: 10,
    documentRevision: 0,
    notes: "",
    target: { origin: hosted },
    textEdits: [],
  };
  expect(revisionSelectionPrompt(hosted, review)).toContain(
    "preserve the saved version's current recipients"
  );
  const privatePrompt = revisionSelectionPrompt(hosted, {
    ...review,
    sharing: { mode: "private", recipients: [desktop] },
  });
  expect(privatePrompt).toContain(desktop);
  expect(privatePrompt).toContain(
    "a new private copy, not an update that inherits old readers"
  );
  expect(privatePrompt).toContain(
    "Do not reuse the bearer-access collaboration room"
  );
  expect(privatePrompt).toContain("hosted draft only");
  for (const mode of ["preserve", "link"] as const) {
    const prompt = revisionSelectionPrompt(hosted, {
      ...review,
      sharing: { mode, recipients: [desktop] },
    });
    expect(prompt).not.toContain(desktop);
  }
  expect(() =>
    revisionSelectionPrompt(hosted, {
      ...review,
      sharing: { mode: "private", recipients: [] },
    })
  ).toThrow();
  expect(() =>
    revisionSelectionPrompt(hosted, {
      ...review,
      sharing: { mode: "private", recipients: ["not-a-key"] },
    })
  ).toThrow();
});
