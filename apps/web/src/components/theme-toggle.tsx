"use client";

import { Check, Monitor, Moon, Palette, Plus, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { TemplatePreview } from "@/components/template-preview";
import { usePlanAppearance } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PLAN_APPEARANCES,
  type PlanAppearance,
  parsePlanAppearance,
} from "@/lib/plan-appearance";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function ThemeToggle({
  templates = false,
  onTemplateRequest,
}: {
  templates?: boolean;
  onTemplateRequest?: (preset: PlanAppearance) => Promise<unknown>;
}) {
  const { resolvedTheme, theme, setTheme } = useTheme();
  const appearance = usePlanAppearance();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [savingRequest, setSavingRequest] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [draft, setDraft] = useState(PLAN_APPEARANCES[0]);
  const [importError, setImportError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const dismiss = () => setOpen(false);
    window.addEventListener("blur", dismiss);
    return () => window.removeEventListener("blur", dismiss);
  }, [open]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = useCallback(() => {
    if (!(mounted && resolvedTheme)) {
      return;
    }
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [mounted, resolvedTheme, setTheme]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }
      const cmdShiftD =
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "d";
      const loneD =
        !(event.metaKey || event.ctrlKey || event.altKey) && event.key === "d";
      if (!(cmdShiftD || loneD)) {
        return;
      }
      event.preventDefault();
      toggleTheme();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [toggleTheme]);

  return (
    <>
      <Popover
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setDraft(appearance.preset ?? PLAN_APPEARANCES[0]);
          }
        }}
        open={open}
      >
        <PopoverTrigger asChild>
          <Button
            aria-label="Themes"
            className="relative"
            size="icon"
            type="button"
            variant="ghost"
          >
            <Palette className="size-5" />
            <span className="sr-only">Themes</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="max-h-[calc(100dvh-5rem)] w-[380px] max-w-[calc(100vw-1rem)] gap-4 overflow-y-auto p-4"
        >
          <p className="font-medium">Appearance</p>
          <fieldset className="grid grid-cols-3 gap-1 rounded-lg border p-1">
            <legend className="sr-only">Color mode</legend>
            {[
              { Icon: Sun, label: "Light", value: "light" },
              { Icon: Moon, label: "Dark", value: "dark" },
              { Icon: Monitor, label: "System", value: "system" },
            ].map(({ value, label, Icon }) => (
              <label
                className="relative flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-md text-xs has-checked:bg-muted has-focus-visible:ring-2 has-focus-visible:ring-ring"
                key={value}
              >
                <input
                  checked={mounted && theme === value}
                  className="sr-only"
                  name="appearance-mode"
                  onChange={() => setTheme(value)}
                  type="radio"
                  value={value}
                />
                <Icon className="size-4" />
                {label}
              </label>
            ))}
          </fieldset>
          {templates ? (
            <>
              <div className="flex items-center justify-between border-t pt-3">
                <p className="font-medium text-sm">Template</p>
                <Button
                  aria-label="Add page style"
                  onClick={() => {
                    setOpen(false);
                    setImportError(null);
                    setAdding(true);
                  }}
                  size="icon-sm"
                  variant="outline"
                >
                  <Plus />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {appearance.presets.map((preset) => (
                  <button
                    aria-label={`Choose ${preset.name} template`}
                    aria-pressed={draft.name === preset.name}
                    className="relative min-w-0 rounded-lg border p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-ring"
                    key={preset.name}
                    onClick={() => setDraft(preset)}
                    type="button"
                  >
                    <TemplatePreview
                      dark={resolvedTheme === "dark"}
                      preset={preset}
                    />
                    {draft.name === preset.name ? (
                      <Check
                        aria-hidden="true"
                        className="absolute top-3 right-3 size-5 rounded-full bg-foreground p-1 text-background"
                      />
                    ) : null}
                    <span className="mt-2 block px-1 text-sm">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                Preview only. Your plan stays unchanged.
              </p>
              <Button
                onClick={() => {
                  setOpen(false);
                  setRequestError("");
                  setRequesting(true);
                }}
                variant="outline"
              >
                Choose template
              </Button>
              <Button
                onClick={() => {
                  appearance.select(null);
                  setOpen(false);
                }}
                size="sm"
                variant="ghost"
              >
                Restore original appearance
              </Button>
              {appearance.storageIssue ? (
                <p className="text-muted-foreground text-xs" role="status">
                  Browser storage is unavailable. Changes may last only in this
                  tab.
                </p>
              ) : null}
            </>
          ) : null}
        </PopoverContent>
      </Popover>
      <Dialog
        onOpenChange={(next) => {
          if (!savingRequest) {
            setRequesting(next);
          }
        }}
        open={requesting}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="font-heading text-2xl">
            Use {draft.name}?
          </DialogTitle>
          <DialogDescription>
            Keep the current plan and ask your agent to adapt it. The request
            becomes a shared annotation, not an automatic rewrite.
          </DialogDescription>
          <Button
            disabled={!onTemplateRequest || savingRequest}
            onClick={async () => {
              if (!onTemplateRequest) {
                return;
              }
              setSavingRequest(true);
              try {
                await onTemplateRequest(draft);
                setRequesting(false);
              } catch {
                setRequestError(
                  "Could not add the request. Your plan is unchanged."
                );
              } finally {
                setSavingRequest(false);
              }
            }}
          >
            {savingRequest ? "Adding request…" : "Add change request"}
          </Button>
          {onTemplateRequest ? null : (
            <p className="text-muted-foreground text-xs">
              Join collaboration to leave a shared request.
            </p>
          )}
          <Button
            onClick={() => {
              appearance.select(draft);
              setRequesting(false);
            }}
            variant="outline"
          >
            Apply colors and typography only
          </Button>
          <a
            className="text-center text-sm underline underline-offset-4"
            href="/new"
          >
            Start a new plan instead
          </a>
          <p className="text-muted-foreground text-xs">
            To clear this document, ask your agent to replace it with Blank.
            Existing annotations stay attached to their original version.
          </p>
          {requestError ? (
            <p className="text-destructive text-sm" role="alert">
              {requestError}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={setAdding} open={adding}>
        <DialogContent>
          <DialogTitle>Add page style</DialogTitle>
          <DialogDescription>
            Import an appearance preset for this browser. It changes colors and
            typography, not the plan’s content.
          </DialogDescription>
          <label className="grid gap-2 text-sm" htmlFor="appearance-preset">
            Preset JSON
            <Input
              accept="application/json,.json"
              id="appearance-preset"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                try {
                  if (file.size > 8192) {
                    throw new Error("Choose a preset smaller than 8 KB.");
                  }
                  const preset = parsePlanAppearance(
                    JSON.parse(await file.text())
                  );
                  appearance.add(preset);
                  setDraft(preset);
                  setAdding(false);
                  setOpen(true);
                } catch (error) {
                  setImportError(
                    error instanceof Error
                      ? error.message
                      : "Could not import this preset."
                  );
                }
                event.target.value = "";
              }}
              type="file"
            />
          </label>
          <a
            className="text-sm underline"
            download
            href="/templates/appearance-example.json"
          >
            Download an example preset
          </a>
          {importError ? (
            <p className="text-destructive text-sm" role="alert">
              {importError}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
