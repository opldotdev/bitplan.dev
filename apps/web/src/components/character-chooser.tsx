"use client";

import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CHARACTERS,
  type CollaboratorProfile,
  characterPortrait,
  loadProfile,
  PROFILE_STORAGE_KEY,
  parseProfile,
} from "@/lib/collaborator";

/** One navbar control. Character selection is a preference, never authentication. */
export function CharacterChooser({
  onChange,
  children,
}: {
  onChange?: (profile: CollaboratorProfile) => void;
  children?: React.ReactNode;
}) {
  const [profile, setProfile] = useState<CollaboratorProfile | null>(null);
  const [storageIssue, setStorageIssue] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => {
    try {
      setProfile(loadProfile(localStorage));
    } catch {
      setProfile({ character: "Martha", name: "Martha" });
      setStorageIssue(true);
    }
    const changed = (event: StorageEvent) => {
      if (event.key !== PROFILE_STORAGE_KEY || !event.newValue) {
        return;
      }
      try {
        setProfile(parseProfile(JSON.parse(event.newValue)));
      } catch {
        /* Ignore invalid external data. */
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  useEffect(() => {
    if (profile) {
      setNameDraft(profile.name);
      onChange?.(profile);
    }
  }, [profile, onChange]);

  function choose(next: CollaboratorProfile) {
    next = parseProfile(next);
    setProfile(next);
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
      setStorageIssue(false);
    } catch {
      setStorageIssue(true);
    }
  }

  function saveName() {
    if (!profile) {
      return;
    }
    if (!nameDraft.trim()) {
      setNameDraft(profile.name);
      return;
    }
    choose({ ...profile, name: nameDraft });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={
            profile
              ? `Your character: ${profile.character}`
              : "Choose your character"
          }
          className="shrink-0 rounded-full"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {profile ? (
            <img
              alt=""
              className="size-7 rounded-full object-cover"
              height={28}
              referrerPolicy="no-referrer"
              src={characterPortrait(profile.character)}
              width={28}
            />
          ) : (
            <UserRound />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[var(--radix-popover-content-available-height)] w-[640px] max-w-[calc(100vw-1rem)] overflow-y-auto p-3"
      >
        <p className="font-medium">Your character</p>
        <p className="text-muted-foreground text-xs">
          From the bopen.ai roster. Used across your plans.
        </p>
        <div
          aria-label="Roster characters"
          className="grid grid-cols-5 gap-1 sm:grid-cols-8"
        >
          {CHARACTERS.map((character) => (
            <Button
              aria-label={character}
              aria-pressed={profile?.character === character}
              className="h-auto min-w-0 flex-col gap-0.5 p-1 text-[10px] aria-pressed:bg-muted aria-pressed:ring-1 aria-pressed:ring-ring"
              key={character}
              onClick={() =>
                choose({
                  character,
                  name:
                    profile?.name && profile.name !== profile.character
                      ? profile.name
                      : character,
                })
              }
              type="button"
              variant="ghost"
            >
              <img
                alt=""
                className="size-9 rounded-full object-cover"
                height={36}
                loading="lazy"
                referrerPolicy="no-referrer"
                src={characterPortrait(character)}
                width={36}
              />
              <span className="w-full truncate text-center">{character}</span>
            </Button>
          ))}
        </div>
        <label className="grid gap-1 border-t pt-3 text-xs">
          Display name
          <Input
            maxLength={80}
            onBlur={saveName}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveName();
              }
            }}
            value={nameDraft}
          />
        </label>
        {storageIssue ? (
          <p className="text-muted-foreground text-xs" role="status">
            Browser storage is unavailable. This choice lasts for this tab only.
          </p>
        ) : null}
        {children}
      </PopoverContent>
    </Popover>
  );
}
