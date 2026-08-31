import { describe, expect, test } from "bun:test";

import {
  isUiSoundName,
  playUiSound,
  resetUiSoundForTests,
  UI_SOUND_FILES,
  UI_SOUND_HOVER_THROTTLE_MS,
} from "./ui-sound";

describe("ui sound catalog", () => {
  test("every mapped file is a public audio path", () => {
    for (const [name, src] of Object.entries(UI_SOUND_FILES)) {
      expect(isUiSoundName(name)).toBe(true);
      expect(src.startsWith("/audio/ui/")).toBe(true);
      expect(src.endsWith(".mp3")).toBe(true);
    }
  });

  test("unknown names are rejected", () => {
    expect(isUiSoundName("tooltip-show")).toBe(false);
    expect(isUiSoundName("loading-start")).toBe(false);
  });

  test("hover throttle is 150ms", () => {
    expect(UI_SOUND_HOVER_THROTTLE_MS).toBe(150);
  });

  test("play is a silent no-op before unlock", () => {
    resetUiSoundForTests();
    expect(() => {
      playUiSound("item-hover");
    }).not.toThrow();
  });
});
