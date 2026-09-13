"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

/** Capture the save closure on edit: concurrent changes must conflict, not overwrite. */
export function InlinePlanTitle({
  title,
  onSave,
}: {
  title: string;
  onSave?: (title: string) => Promise<unknown>;
}) {
  const [edit, setEdit] = useState<{
    value: string;
    save: (title: string) => Promise<unknown>;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const canceled = useRef(false);
  async function save() {
    if (!edit || inFlight.current || canceled.current) {
      return;
    }
    const value = edit.value.trim();
    if (!value) {
      toast.error("Add a plan name.");
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await edit.save(value);
      setEdit(null);
    } catch {
      toast.error(
        "Name not saved. The plan may have changed. Cancel and try again."
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  if (edit) {
    return (
      <form
        className="min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Input
          aria-label="Plan name"
          autoFocus
          className="h-8"
          disabled={saving}
          maxLength={160}
          onBlur={() => void save()}
          onChange={(event) => setEdit({ ...edit, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              canceled.current = true;
              setEdit(null);
            }
          }}
          title="Enter to save · Escape to cancel"
          value={edit.value}
        />
      </form>
    );
  }
  if (!onSave) {
    return <span className="truncate">{title}</span>;
  }
  return (
    <button
      aria-label={`Rename ${title}`}
      className="min-w-0 truncate text-left hover:text-foreground"
      onClick={() => {
        canceled.current = false;
        setEdit({ save: onSave, value: title });
      }}
      title="Rename plan"
      type="button"
    >
      {title}
    </button>
  );
}
