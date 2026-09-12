/** Public bopen.ai roster snapshot, verified against /api/marketplace. */
export const CHARACTERS = [
  "Ada",
  "Alex",
  "Anthony",
  "Caal",
  "Chief",
  "Clark",
  "Data Accumulator",
  "David",
  "Flow",
  "Frames",
  "Idris",
  "Jason",
  "Jerry",
  "Johnny",
  "Kayle",
  "Kira",
  "Kris",
  "Kurt",
  "Leaf",
  "Lisa",
  "Martha",
  "Maxim",
  "Milton",
  "Mina",
  "Orbit",
  "Ordi",
  "Parker",
  "Paul",
  "Ridd",
  "Root",
  "Satchmo",
  "Satoshi",
  "Siggy",
  "Steve",
  "Theo",
  "Tina",
  "Torque",
  "Uno Satoj",
  "Wags",
  "Zack",
] as const;

export type Character = (typeof CHARACTERS)[number];
export interface CollaboratorProfile {
  character: Character;
  name: string;
}

// Deliberately not scoped to an origin, room, or plan version.
export const PROFILE_STORAGE_KEY = "bitplan:collaborator:v1";

export function parseProfile(value: unknown): CollaboratorProfile {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid character profile.");
  }
  const profile = value as Record<string, unknown>;
  if (
    !CHARACTERS.some((character) => character === profile.character) ||
    typeof profile.name !== "string" ||
    !profile.name.trim() ||
    profile.name.length > 80
  ) {
    throw new Error("Choose a roster character and a name of 1–80 characters.");
  }
  return {
    character: profile.character as Character,
    name: profile.name.trim(),
  };
}

export function characterPortrait(character: Character): string {
  const slug = character.toLowerCase().replaceAll(" ", "-");
  return `https://bopen.ai/images/agents/optimized/${slug}-96.webp`;
}

export function loadProfile(
  storage: Pick<Storage, "getItem" | "setItem">
): CollaboratorProfile {
  const saved = storage.getItem(PROFILE_STORAGE_KEY);
  if (saved) {
    try {
      return parseProfile(JSON.parse(saved));
    } catch {
      /* Replace invalid preferences only. */
    }
  }
  const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  const character = CHARACTERS[random % CHARACTERS.length] ?? "Martha";
  const profile = { character, name: character };
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}
