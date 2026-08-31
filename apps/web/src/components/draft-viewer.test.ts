import { describe, expect, test } from "bun:test";

import {
  isViewerStateCurrent,
  metaRows,
  type ViewerState,
  viewerRequestKey,
} from "./draft-viewer";

const ORIGIN_A = `${"a".repeat(64)}_0`;
const ORIGIN_B = `${"b".repeat(64)}_0`;

function decryptedState(requestKey: string): ViewerState {
  return {
    draft: {
      content: {
        bytes: Uint8Array.of(1),
        contentType: "application/x-bitplan",
        origin: ORIGIN_A,
        outpoint: ORIGIN_A,
        sequence: 0,
      },
      currentVersion: 1,
      latestVersion: 2,
      origin: ORIGIN_A,
    },
    phase: "decrypted",
    plaintext: {
      html: "<p>private</p>",
      meta: {
        cliVersion: "test",
        createdAt: "2026-08-29T00:00:00.000Z",
        description: null,
        fileSha256: "hash",
        gitBranch: null,
        gitCommitSha: null,
        gitCommitSubject: null,
        gitDirty: null,
        repoHost: null,
        repoName: null,
        repoOrg: null,
        title: null,
      },
    },
    requestKey,
  };
}

describe("DraftViewer route state", () => {
  test("rejects decrypted state from a different origin", () => {
    const oldState = decryptedState(viewerRequestKey(ORIGIN_A, null));
    expect(
      isViewerStateCurrent(oldState, viewerRequestKey(ORIGIN_B, null))
    ).toBe(false);
  });

  test("rejects decrypted state from a different requested version", () => {
    const oldState = decryptedState(viewerRequestKey(ORIGIN_A, 1));
    expect(isViewerStateCurrent(oldState, viewerRequestKey(ORIGIN_A, 2))).toBe(
      false
    );
  });

  test("accepts state produced for the current origin and version", () => {
    const requestKey = viewerRequestKey(ORIGIN_A, 2);
    expect(isViewerStateCurrent(decryptedState(requestKey), requestKey)).toBe(
      true
    );
  });
});

describe("Draft metadata", () => {
  test("shows every envelope metadata field", () => {
    const state = decryptedState("test");
    if (state.phase !== "decrypted") {
      throw new Error("Expected decrypted state.");
    }
    const rows = metaRows({
      ...state.plaintext.meta,
      cliVersion: "0.0.8",
      fileSha256: "f".repeat(64),
      gitCommitSha: "a".repeat(40),
      gitCommitSubject: "Ship it",
      gitDirty: false,
    });

    expect(rows).toContainEqual({ label: "Working tree", value: "Clean" });
    expect(rows).toContainEqual({ label: "CLI", value: "0.0.8" });
    expect(rows).toContainEqual({
      label: "File SHA-256",
      value: "f".repeat(64),
    });
    expect(rows).toContainEqual({
      label: "Commit",
      value: "a".repeat(40),
    });
  });

  test("identifies plans created on the website", () => {
    const state = decryptedState("test");
    if (state.phase !== "decrypted") {
      throw new Error("Expected decrypted state.");
    }

    expect(
      metaRows({ ...state.plaintext.meta, cliVersion: "web" })
    ).toContainEqual({ label: "Created by", value: "bitplan.dev" });
  });
});
