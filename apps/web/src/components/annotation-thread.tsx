"use client";

import { Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { annotationLink } from "@/lib/annotation-link";
import { mentionParts, roomHandles } from "@/lib/annotation-thread";
import type { Annotation } from "@/lib/annotations";
import type { CollaboratorProfile } from "@/lib/collaborator";

export function AnnotationThread({
  item,
  replies,
  profiles,
  currentParticipantId,
  onReply,
  onResolve,
  disabled = false,
}: {
  item: Annotation;
  replies: Annotation[];
  profiles: Record<string, CollaboratorProfile>;
  currentParticipantId?: string;
  onReply: (text: string) => Promise<unknown>;
  onResolve?: (reply: Annotation) => Promise<unknown>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const handles = roomHandles(profiles);
  const render = (value: string) => {
    const href = annotationLink(value);
    if (href) {
      return (
        <a
          className="break-words underline underline-offset-4"
          href={href}
          referrerPolicy="no-referrer"
          rel="noopener noreferrer"
          target="_blank"
        >
          {value}
        </a>
      );
    }
    return mentionParts(value, handles).map((part, index) =>
      part.recipient ? (
        <mark
          className={
            part.recipient.id === currentParticipantId
              ? "rounded bg-primary/20 px-0.5 text-foreground ring-1 ring-primary/40"
              : "rounded bg-muted px-0.5 text-foreground"
          }
          key={`${index}-${part.text}`}
          title={`${part.recipient.name} · room profile`}
        >
          {part.text}
        </mark>
      ) : (
        part.text
      )
    );
  };
  async function submit() {
    if (!text.trim() || busy || disabled) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onReply(text.trim());
      setText("");
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not send reply. Your text is still here."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div data-annotation-thread={item.id}>
      <p className="whitespace-pre-wrap break-words">
        {item.content.type === "text" ? render(item.content.text) : null}
      </p>
      {replies.length ? (
        <ol aria-label="Replies" className="mt-3 space-y-3 border-l pl-3">
          {replies.map((reply) => (
            <li data-reply-id={reply.id} key={reply.id}>
              <p className="text-muted-foreground text-xs">
                {profiles[reply.participantId]?.name ?? "Collaborator"}
                {reply.status === "resolved" ? " · resolved" : ""}
              </p>
              <p className="whitespace-pre-wrap break-words">
                {reply.content.type === "text"
                  ? render(reply.content.text)
                  : null}
              </p>
              {onResolve &&
              reply.participantId === currentParticipantId &&
              reply.status === "open" ? (
                <Button
                  aria-label="Remove my reply"
                  onClick={() => void onResolve(reply)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {open ? (
        <div className="mt-3 space-y-2">
          <Textarea
            aria-label="Reply to annotation"
            disabled={busy}
            maxLength={10_000}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void submit();
              }
              if (event.key === "Escape" && !busy) {
                setOpen(false);
              }
            }}
            placeholder="Reply… Enter sends"
            ref={input}
            value={text}
          />
          <details>
            <summary className="cursor-pointer text-muted-foreground text-xs">
              Mention someone
            </summary>
            <div className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-auto">
              {handles.map((handle) => (
                <Button
                  className="h-auto px-2 py-1 text-xs"
                  disabled={busy}
                  key={handle.id}
                  onClick={() => {
                    setText(
                      (value) =>
                        `${value}${value && !value.endsWith(" ") ? " " : ""}${handle.handle} `
                    );
                    input.current?.focus();
                  }}
                  title={`${handle.name} · room profile`}
                  type="button"
                  variant="ghost"
                >
                  {handle.handle}
                </Button>
              ))}
            </div>
          </details>
          <div className="flex justify-between">
            <Button
              disabled={busy}
              onClick={() => setOpen(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !text.trim() || disabled}
              onClick={() => void submit()}
              size="sm"
              type="button"
            >
              {busy ? "Sending…" : "Reply"}
            </Button>
          </div>
          {error ? (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <Button
          className="mt-2 h-7 px-1 text-xs"
          disabled={disabled}
          onClick={() => setOpen(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          Reply{replies.length ? ` · ${replies.length}` : ""}
        </Button>
      )}
    </div>
  );
}
