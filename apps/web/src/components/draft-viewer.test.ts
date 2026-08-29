import { describe, expect, test } from "bun:test";

import {
  isViewerStateCurrent,
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
