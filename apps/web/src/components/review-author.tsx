import Image from "next/image";
import {
  type CollaboratorProfile,
  characterPortrait,
} from "@/lib/collaborator";

export function ReviewAuthor({
  profile,
  detail,
}: {
  profile?: { name: string; character?: CollaboratorProfile["character"] };
  detail: string;
}) {
  const name = profile?.name ?? "Collaborator";
  return (
    <span className="flex items-center gap-3">
      {profile?.character ? (
        <Image
          alt=""
          className="size-10 shrink-0 rounded-xl object-cover ring-1 ring-border/60"
          height={40}
          src={characterPortrait(profile.character)}
          unoptimized
          width={40}
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted font-medium text-muted-foreground"
        >
          {name.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground text-sm">
          {name}
        </span>
        <span className="block text-muted-foreground text-xs">{detail}</span>
      </span>
    </span>
  );
}
