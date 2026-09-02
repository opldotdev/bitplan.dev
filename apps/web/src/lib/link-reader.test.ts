import { describe, expect, test } from "bun:test";
import { PrivateKey, ProtoWallet, Utils } from "@bsv/sdk";

import {
  type DraftPlaintext,
  EnvelopeAccessError,
  openEnvelope,
  sealEnvelope,
} from "./envelope";
import { linkWallet, parseLinkFragment } from "./link-reader";

const PLAINTEXT: DraftPlaintext = {
  html: "<!doctype html><title>Link plan</title><p>hello</p>",
  meta: {
    cliVersion: "0.0.1",
    createdAt: "2026-01-01T00:00:00.000Z",
    description: "phase one",
    fileSha256: "b".repeat(64),
    gitBranch: "master",
    gitCommitSha: "a".repeat(40),
    gitCommitSubject: "feat: something",
    gitDirty: false,
    repoHost: "github.com",
    repoName: "bitplan.dev",
    repoOrg: "b-open-io",
    title: "Link plan",
  },
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function bytesOfLength(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i % 255) + 1);
}

describe("parseLinkFragment", () => {
  test("accepts #k=, bare k=, and a full URL", () => {
    const secret = bytesOfLength(32);
    const hex = Utils.toHex(secret);
    const encoded = toBase64Url(secret);
    const origin = `${"a".repeat(64)}_0`;

    expect(parseLinkFragment(`#k=${encoded}`)).toBe(hex);
    expect(parseLinkFragment(`k=${encoded}`)).toBe(hex);
    expect(
      parseLinkFragment(`https://bitplan.dev/d/${origin}#k=${encoded}`)
    ).toBe(hex);
  });

  test("rejects 31-byte and 33-byte secrets and missing fragments", () => {
    expect(
      parseLinkFragment(`#k=${toBase64Url(bytesOfLength(31))}`)
    ).toBeNull();
    expect(
      parseLinkFragment(`#k=${toBase64Url(bytesOfLength(33))}`)
    ).toBeNull();
    expect(parseLinkFragment("")).toBeNull();
    expect(parseLinkFragment("#")).toBeNull();
    expect(parseLinkFragment("https://bitplan.dev/d/abc")).toBeNull();
  });
});

describe("linkWallet", () => {
  test("identity equals the public key of the secret", async () => {
    const secretHex = PrivateKey.fromRandom().toHex().padStart(64, "0");
    const identity = (
      await linkWallet(secretHex).getPublicKey({ identityKey: true })
    ).publicKey;
    expect(identity.toLowerCase()).toBe(
      PrivateKey.fromHex(secretHex).toPublicKey().toString().toLowerCase()
    );
  });

  test("opens an envelope sealed for the link public key and rejects another secret", async () => {
    const secretHex = PrivateKey.fromRandom().toHex().padStart(64, "0");
    const reader = linkWallet(secretHex);
    const linkIdentity = (await reader.getPublicKey({ identityKey: true }))
      .publicKey;
    const owner = new ProtoWallet(new PrivateKey(1));
    const envelope = await sealEnvelope(owner, PLAINTEXT, "key-1", [
      linkIdentity,
    ]);

    expect((await openEnvelope(reader, envelope)).plaintext).toEqual(PLAINTEXT);

    const otherHex = PrivateKey.fromRandom().toHex().padStart(64, "0");
    try {
      await openEnvelope(linkWallet(otherHex), envelope);
      throw new Error("expected outsider rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvelopeAccessError);
      expect((error as EnvelopeAccessError).issue).toBe("not-authorized");
    }
  });
});
