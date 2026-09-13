"use client";

import { Copy, FileText, ListX, LockKeyhole } from "lucide-react";
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
}: {
  origin: string;
  publisher: boolean;
}) {
  const sharing = useRevisionSharing();
  const [annotations, setAnnotations] = useState(false);
  const [keys, setKeys] = useState("");
  const parsed = parseIdentityKeys(keys);
  if (!sharing) {
    return null;
  }
  const { currentAccess, value, update } = sharing;
  return (
    <section aria-label="Plan access" className="space-y-3 border-b pb-4">
      <h3 className="flex items-center gap-2 font-medium text-sm">
        <LockKeyhole className="size-4" />
        Current access
      </h3>
      {currentAccess.link ? (
        <p className="text-sm">Anyone with the full link</p>
      ) : (
        <PrivateContacts
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
        <Popover>
          <PopoverTrigger asChild>
            <Button className="flex-1" size="sm" variant="outline">
              <FileText />
              PDF
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="space-y-3 p-4">
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
              Readable export, not encrypted. Notes are appended with
              attribution.
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
          </PopoverContent>
        </Popover>
      </div>
      {publisher ? (
        <div className="space-y-3">
          <label className="text-sm" htmlFor="revision-access">
            Share next revision
          </label>
          <select
            className="w-full rounded-lg border bg-background p-2 text-sm"
            id="revision-access"
            onChange={(event) => {
              const mode = event.target.value;
              if (
                mode === "preserve" ||
                mode === "link" ||
                mode === "private"
              ) {
                update({ ...value, mode });
              }
            }}
            value={value.mode}
          >
            <option value="preserve">Keep current access</option>
            <option value="link">Anyone with link</option>
            <option value="private">Private copy</option>
          </select>
          {value.mode === "private" ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span>
                  {value.recipients.length} selected · publishing wallet
                  included
                </span>
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
                onChange={(recipients) =>
                  update({ mode: "private", recipients })
                }
                selected={value.recipients}
              />
              <details>
                <summary className="cursor-pointer text-xs">
                  Add public key
                </summary>
                <textarea
                  aria-label="Recipient public keys"
                  className="mt-2 w-full rounded-lg border p-2 font-mono text-xs"
                  onChange={(event) => setKeys(event.target.value)}
                  value={keys}
                />
                <Button
                  disabled={!parsed.valid.length || !!parsed.invalid.length}
                  onClick={() => {
                    update({
                      mode: "private",
                      recipients: [
                        ...new Set([...value.recipients, ...parsed.valid]),
                      ],
                    });
                    setKeys("");
                  }}
                  size="sm"
                  variant="outline"
                >
                  Add
                </Button>
              </details>
            </>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Applied when the next version or copy is created.
          </p>
        </div>
      ) : null}
    </section>
  );
}
