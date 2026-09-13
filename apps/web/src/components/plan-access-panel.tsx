"use client";

import {
  Copy,
  FileText,
  ListX,
  LockKeyhole,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PrivateContacts } from "@/components/private-contacts";
import { useRevisionSharing } from "@/components/revision-sharing";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { parseIdentityKeys } from "@/lib/sharing";

/** Access intent is owner-only; copying an existing invitation never changes it. */
export function PlanAccessPanel({
  origin,
  publisher,
  view = "access",
}: {
  origin: string;
  publisher: boolean;
  view?: "access" | "pdf";
}) {
  const sharing = useRevisionSharing();
  const [annotations, setAnnotations] = useState(false);
  if (!sharing) {
    return null;
  }
  const { currentAccess, value, update } = sharing;
  const defaults = currentAccess.link ? [] : currentAccess.recipients;
  const selectedRecipients =
    value.mode === "preserve" ? defaults : value.recipients;
  if (view === "pdf") {
    return (
      <section aria-label="Export PDF" className="space-y-5">
        {" "}
        <label
          className="flex items-center justify-between gap-2 text-xs"
          htmlFor="pdf-annotations"
        >
          Include annotations
          <Switch
            checked={annotations}
            id="pdf-annotations"
            onCheckedChange={setAnnotations}
          />
        </label>
        <p className="text-muted-foreground text-xs">
          Readable export, not encrypted. Notes are appended with attribution.
        </p>
        <Button
          onClick={async () => {
            try {
              if (!sharing.print.current) {
                throw new Error("Wait for the document to open.");
              }
              await sharing.print.current(annotations);
            } catch {
              toast.error("Could not open print preview");
            }
          }}
          size="sm"
          variant="outline"
        >
          <FileText />
          Save as PDF
        </Button>
      </section>
    );
  }
  return (
    <section aria-label="Plan access" className="space-y-3 border-b pb-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium text-sm">
          <LockKeyhole className="size-4" />
          Access
        </h3>
        {publisher ? (
          <Button
            onClick={sharing.reset}
            size="sm"
            title="Restore this document's saved permissions"
            variant="ghost"
          >
            <RotateCcw className="size-3" /> Reset
          </Button>
        ) : null}
      </div>
      {!publisher && currentAccess.link ? (
        <p className="text-sm">Anyone with the full link</p>
      ) : null}
      {publisher || currentAccess.link ? null : (
        <PrivateContacts
          currentRecipients={currentAccess.recipients}
          onChange={() => {
            /* Read-only envelope recipients. */
          }}
          readOnly
          selected={currentAccess.recipients}
        />
      )}
      {publisher ? null : (
        <p className="text-muted-foreground text-xs">
          Access is set by the plan owner.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={async () => {
            try {
              const url = new URL(`/d/${origin}`, window.location.origin);
              await navigator.clipboard.writeText(
                currentAccess.link ? window.location.href : url.href
              );
              toast.success("Plan link copied");
            } catch {
              toast.error("Could not copy the link");
            }
          }}
          size="sm"
          variant="outline"
        >
          <Copy />
          Copy plan link
        </Button>
      </div>
      {publisher ? (
        <div className="space-y-3">
          <select
            aria-label="Share next revision"
            className="w-full rounded-lg border bg-background p-2 text-sm"
            id="revision-access"
            onChange={(event) => {
              const mode = event.target.value;
              if (
                mode === "preserve" ||
                mode === "link" ||
                mode === "private"
              ) {
                update({
                  ...value,
                  mode,
                  recipients:
                    value.mode === "preserve" && mode === "private"
                      ? defaults
                      : value.recipients,
                });
              }
            }}
            value={value.mode}
          >
            <option value="preserve">
              {currentAccess.link
                ? "Anyone with the full link · current"
                : `Private · ${currentAccess.recipients.length} identities · current`}
            </option>
            <option value="link">Anyone with link</option>
            <option value="private">Selected people</option>
          </select>
          {value.mode === "private" ||
          (value.mode === "preserve" && !currentAccess.link) ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span>{selectedRecipients.length} selected</span>
                <Button
                  aria-label="Clear selection"
                  onClick={() => update({ mode: "private", recipients: [] })}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ListX />
                </Button>
              </div>
              <PrivateContacts
                actions={
                  <AddRecipient
                    onAdd={(added) =>
                      update({
                        ...value,
                        mode: "private",
                        recipients: [
                          ...new Set([...selectedRecipients, ...added]),
                        ],
                      })
                    }
                  />
                }
                currentRecipients={defaults}
                onChange={(recipients, teams) =>
                  update({ mode: "private", recipients, teams })
                }
                selected={selectedRecipients}
                teams={value.teams}
              />
            </>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {value.mode === "private"
              ? "Applies to the next version. Earlier versions keep their access."
              : "Saved access is kept unless you change it."}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function AddRecipient({ onAdd }: { onAdd: (keys: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState("");
  const parsed = parseIdentityKeys(keys);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button aria-label="Add public key" size="icon-sm" variant="outline">
          <Plus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-3 p-3">
        <label className="text-sm" htmlFor="extra-recipient-keys">
          Public identity key
        </label>
        <textarea
          aria-label="Recipient public keys"
          className="w-full rounded-lg border p-2 font-mono text-xs"
          id="extra-recipient-keys"
          onChange={(event) => setKeys(event.target.value)}
          value={keys}
        />
        <Button
          disabled={!parsed.valid.length || !!parsed.invalid.length}
          onClick={() => {
            onAdd(parsed.valid);
            setKeys("");
            setOpen(false);
          }}
          size="sm"
        >
          Add
        </Button>
      </PopoverContent>
    </Popover>
  );
}
