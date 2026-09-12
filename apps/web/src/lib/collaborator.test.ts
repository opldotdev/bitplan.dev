import { expect, test } from "bun:test";
import {
  CHARACTERS,
  loadProfile,
  PROFILE_STORAGE_KEY,
  parseProfile,
} from "./collaborator";

test("one random roster preference survives reloads and different plan versions", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const initial = loadProfile(storage);
  expect(CHARACTERS).toContain(initial.character);
  expect(loadProfile(storage)).toEqual(initial);
  storage.setItem(
    PROFILE_STORAGE_KEY,
    JSON.stringify({ character: "Wags", name: "Dave" })
  );
  expect(loadProfile(storage)).toEqual({ character: "Wags", name: "Dave" });
  expect(() => parseProfile({ character: "Invented", name: "Dave" })).toThrow();
  expect(() => parseProfile({ character: "Wags", name: " " })).toThrow();
});
