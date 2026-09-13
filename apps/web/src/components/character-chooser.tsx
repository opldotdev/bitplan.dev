"use client";

import { UserRound } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CHARACTERS,
  type Character,
  type CollaboratorProfile,
  characterPortrait,
  loadProfile,
  PROFILE_STORAGE_KEY,
  parseProfile,
} from "@/lib/collaborator";

function characterFromButton(button: HTMLButtonElement): Character {
  return button.value as Character;
}

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
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) {
      return;
    }
    // Pointer events inside the sandboxed plan do not bubble to Radix.
    // Focusing that frame (or leaving the window) should dismiss this menu.
    const dismiss = () => setOpen(false);
    window.addEventListener("blur", dismiss);
    return () => window.removeEventListener("blur", dismiss);
  }, [open]);
  const [nameDraft, setNameDraft] = useState("");
  const [previewCharacter, setPreviewCharacter] = useState<Character | null>(
    null
  );
  const displayNameId = useId();
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

  const choose = useCallback((candidate: CollaboratorProfile) => {
    const next = parseProfile(candidate);
    setProfile(next);
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
      setStorageIssue(false);
    } catch {
      setStorageIssue(true);
    }
  }, []);

  const saveName = useCallback(() => {
    if (!profile) {
      return;
    }
    if (!nameDraft.trim()) {
      setNameDraft(profile.name);
      return;
    }
    choose({ ...profile, name: nameDraft });
  }, [choose, nameDraft, profile]);

  const changeName = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setNameDraft(event.target.value);
    },
    []
  );

  const submitName = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveName();
      }
    },
    [saveName]
  );

  const selectCharacter = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const character = characterFromButton(event.currentTarget);
      choose({
        character,
        name:
          profile?.name && profile.name !== profile.character
            ? profile.name
            : character,
      });
    },
    [choose, profile]
  );

  const showCharacter = useCallback(
    (
      event:
        | React.FocusEvent<HTMLButtonElement>
        | React.PointerEvent<HTMLButtonElement>
    ) => {
      setPreviewCharacter(characterFromButton(event.currentTarget));
    },
    []
  );

  const showSelectedCharacter = useCallback(() => {
    setPreviewCharacter(null);
  }, []);

  const shownCharacter =
    previewCharacter ?? profile?.character ?? "Choose a character";

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={
            profile
              ? `${profile.name}, ${profile.character}. Change profile`
              : "Choose your character"
          }
          className="shrink-0 rounded-full"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {profile ? (
            <Image
              alt=""
              className="shrink-0 rounded-full object-cover"
              height={26}
              referrerPolicy="no-referrer"
              src={characterPortrait(profile.character)}
              style={{ height: 26, width: 26 }}
              unoptimized
              width={26}
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
        <label className="grid gap-1.5" htmlFor={displayNameId}>
          <span className="font-medium text-sm">Display name</span>
          <Input
            className="h-11 text-base"
            id={displayNameId}
            maxLength={80}
            onBlur={saveName}
            onChange={changeName}
            onKeyDown={submitName}
            value={nameDraft}
          />
          <span className="text-muted-foreground text-xs">
            Visible to collaborators across your plans.
          </span>
        </label>
        <div className="mt-3 border-t pt-3">
          <div className="flex min-h-11 items-end justify-between gap-3">
            <div>
              <p className="text-muted-foreground text-xs">Character</p>
              <p className="font-medium text-lg leading-tight">
                {shownCharacter}
              </p>
            </div>
            <p className="text-right text-muted-foreground text-xs">
              Hover, focus, or tap a portrait
            </p>
          </div>
          <fieldset className="mt-2 border-0 p-0">
            <legend className="sr-only">Roster characters</legend>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
              {CHARACTERS.map((character) => (
                <Button
                  aria-label={character}
                  aria-pressed={profile?.character === character}
                  className="relative aspect-square h-auto min-w-0 overflow-hidden rounded-md p-0 aria-pressed:ring-2 aria-pressed:ring-ring"
                  key={character}
                  onBlur={showSelectedCharacter}
                  onClick={selectCharacter}
                  onFocus={showCharacter}
                  onPointerEnter={showCharacter}
                  onPointerLeave={showSelectedCharacter}
                  title={character}
                  type="button"
                  value={character}
                  variant="ghost"
                >
                  <Image
                    alt=""
                    className="rounded-[inherit] object-cover"
                    fill
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    sizes="(max-width: 639px) 20vw, 76px"
                    src={characterPortrait(character)}
                    unoptimized
                  />
                </Button>
              ))}
            </div>
          </fieldset>
        </div>
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
