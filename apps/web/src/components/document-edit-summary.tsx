import { Undo2 } from "lucide-react";
import { ReviewAuthor } from "@/components/review-author";
import { ReviewSelection } from "@/components/review-selection";
import { Button } from "@/components/ui/button";
import type { CollaboratorProfile } from "@/lib/collaborator";
import type { AuthorTextEdit } from "@/lib/inline-text";

/** Latest patch per author and passage, not a keystroke history. */
export function DocumentEditSummary({
  blocks,
  htmlRevision,
  profiles = {},
  currentParticipantId,
  excluded = new Set<string>(),
  onToggle,
  onRevert,
  onConsiderAll,
}: {
  blocks: readonly AuthorTextEdit[];
  htmlRevision?: number;
  profiles?: Record<
    string,
    { name: string; character?: CollaboratorProfile["character"] }
  >;
  currentParticipantId?: string;
  excluded?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  onRevert?: (block: AuthorTextEdit) => void;
  onConsiderAll?: (include: boolean) => void;
}) {
  if (!blocks.length && htmlRevision === undefined) {
    return null;
  }
  return (
    <section aria-label="Document edits" className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-sm">Document edits</h3>
        {onConsiderAll && blocks.length ? (
          <div className="flex gap-1">
            <Button
              onClick={() => onConsiderAll(true)}
              size="xs"
              variant="ghost"
            >
              Consider all
            </Button>
            <Button
              onClick={() => onConsiderAll(false)}
              size="xs"
              variant="ghost"
            >
              Consider none
            </Button>
          </div>
        ) : null}
      </div>
      {htmlRevision === undefined ? null : (
        <p className="text-sm">
          Shared HTML replacement · revision {htmlRevision}
        </p>
      )}
      {blocks.map((block) => (
        <div
          className="group/review flex items-start gap-3 border-border/50 border-b py-5 text-sm"
          key={`${block.roomId}:${block.participantId}:${block.path}`}
        >
          <div className="order-last flex shrink-0 flex-col items-end gap-2 pt-1">
            {onToggle ? (
              <ReviewSelection
                included={
                  !excluded.has(
                    JSON.stringify([block.participantId, block.path])
                  )
                }
                onToggle={() =>
                  onToggle(JSON.stringify([block.participantId, block.path]))
                }
              />
            ) : null}
            {onRevert &&
            block.participantId === currentParticipantId &&
            !blocks.some(
              (other) =>
                other.path === block.path && other.revision > block.revision
            ) ? (
              <Button
                aria-label="Restore original passage"
                className="opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                onClick={() => onRevert(block)}
                size="icon-sm"
                title="Restore original passage; keeps edit history"
                variant="ghost"
              >
                <Undo2 />
              </Button>
            ) : null}
          </div>

          <details className="min-w-0 flex-1">
            <summary className="cursor-pointer list-none rounded-lg outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <ReviewAuthor
                detail={`${block.deleted ? "Removed text" : "Text edit"} · edit ${block.revision}`}
                profile={profiles[block.participantId]}
              />
              <span className="mt-3 block rounded-xl bg-muted/45 px-4 py-3 leading-relaxed">
                <span className="line-clamp-2">
                  {block.deleted ? block.original : block.text}
                </span>
              </span>
              <span className="mt-2 block text-muted-foreground text-xs">
                View change ↗
              </span>
            </summary>
            <div className="mt-3 space-y-3 whitespace-pre-wrap break-words border-border border-l-2 pl-4">
              <p className="text-muted-foreground text-xs">
                Edited by{" "}
                {profiles[block.participantId]?.name ?? "Collaborator"}
                {blocks.some(
                  (other) =>
                    other.path === block.path && other.revision > block.revision
                )
                  ? " · Superseded by a later edit"
                  : " · Applied"}
              </p>
              <p className="text-muted-foreground">
                <span className="block text-xs">Before</span>
                {block.original}
              </p>
              <p>
                <span className="block text-muted-foreground text-xs">
                  Author’s edit
                </span>
                {block.deleted
                  ? "Removed from the shared document"
                  : block.text}
              </p>
            </div>
          </details>
        </div>
      ))}
    </section>
  );
}
