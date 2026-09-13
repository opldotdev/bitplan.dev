import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  profiles?: Record<string, { name: string }>;
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
    <section aria-label="Document edits" className="space-y-3 border-t pt-3">
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
          className="flex items-start gap-3 border-b py-3 text-sm"
          key={`${block.roomId}:${block.participantId}:${block.path}`}
        >
          <div className="flex shrink-0 items-center gap-1">
            {onToggle ? (
              <label className="flex items-center gap-2 text-xs">
                <input
                  checked={
                    !excluded.has(
                      JSON.stringify([block.participantId, block.path])
                    )
                  }
                  onChange={() =>
                    onToggle(JSON.stringify([block.participantId, block.path]))
                  }
                  type="checkbox"
                />
                <span className="sr-only">Consider in revision</span>
              </label>
            ) : null}
            {onRevert &&
            block.participantId === currentParticipantId &&
            !blocks.some(
              (other) =>
                other.path === block.path && other.revision > block.revision
            ) ? (
              <Button
                aria-label="Restore original passage"
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
            <summary className="cursor-pointer truncate">
              {block.deleted ? "Removed text" : "Changed text"}:{" "}
              {block.original.slice(0, 70)}
              {block.original.length > 70 ? "…" : ""}
            </summary>
            <div className="mt-3 space-y-2 whitespace-pre-wrap break-words">
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
