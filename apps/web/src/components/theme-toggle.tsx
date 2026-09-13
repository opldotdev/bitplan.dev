"use client";

import { Check, Monitor, Moon, Plus, Sun } from "lucide-react";
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
import { PLAN_APPEARANCES, parsePlanAppearance } from "@/lib/plan-appearance";

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

export function ThemeToggle({ templates = false }: { templates?: boolean }) {
  const { resolvedTheme, theme, setTheme } = useTheme();
  const appearance = usePlanAppearance();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
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
            aria-label="Appearance"
            className="relative"
            size="icon"
            type="button"
            variant="ghost"
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Appearance</span>
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
                <p className="font-medium text-sm">Page style</p>
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
                  appearance.select(draft);
                  setOpen(false);
                }}
                variant="outline"
              >
                Use page style
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
