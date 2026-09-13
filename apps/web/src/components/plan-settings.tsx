"use client";

import { useTheme } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getSoundPreference,
  playUiSound,
  setSoundPreference,
  soundPreference,
} from "@/lib/ui-sound";

const shortcuts = [
  ["Pan document", "Hold middle mouse + drag"],
  ["Zoom document", "Shift + wheel"],
  ["Select text", "V"],
  ["Add note", "T"],
  ["Add image", "I"],
  ["Show tools", "Shift"],
  ["Clear selection", "Esc"],
  ["Save note", "Enter"],
  ["New line", "Shift + Enter"],
  ["Remove selection", "Delete"],
  ["Undo removal", "⌘ / Ctrl + Z"],
];

export function PlanSettings({
  section,
  browserMenu,
  onBrowserMenuChange,
  interaction,
  details,
  onResetView,
}: {
  section: string;
  browserMenu: boolean;
  onBrowserMenuChange: (enabled: boolean) => void;
  interaction: ReactNode;
  details: ReactNode;
  onResetView?: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [sound, setSound] = useState(() => soundPreference(null));
  useEffect(() => {
    setSound(getSoundPreference());
  }, []);
  return (
    <section
      aria-label={`${section} settings`}
      className="plan-scroll scroll-fade min-h-0 flex-1 overflow-y-auto pb-8 [--scroll-fade-size:16px]"
    >
      {section === "Interaction" ? (
        <>
          <Button className="mb-6" onClick={onResetView} variant="outline">
            Reset view · 100%
          </Button>
          <div className="flex items-center justify-between gap-3">
            <label className="text-base" htmlFor="plan-context-tools">
              Plan right-click tools
            </label>
            <Switch
              checked={!browserMenu}
              id="plan-context-tools"
              onCheckedChange={(enabled) => onBrowserMenuChange(!enabled)}
            />
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            Off uses your browser menu.
          </p>
          <section
            aria-label="Keyboard shortcuts"
            className="mt-8 border-t pt-7"
          >
            <h3 className="mb-4 font-serif text-xl">Keyboard shortcuts</h3>
            <dl>
              {shortcuts.map(([action, key]) => (
                <div
                  className="flex items-center justify-between gap-3 border-border/50 border-b py-3 text-sm"
                  key={action}
                >
                  <dt>{action}</dt>
                  <dd>
                    <kbd className="whitespace-nowrap rounded-md border bg-muted px-2.5 py-1 font-mono text-xs shadow-sm">
                      {key}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <details className="mt-7">
            <summary className="cursor-pointer text-muted-foreground text-sm">
              View & editing tools
            </summary>
            <div className="mt-4 space-y-4">{interaction}</div>
          </details>
          <p className="mt-8 text-muted-foreground text-xs">
            Menu preference saves automatically on this device.
          </p>
        </>
      ) : null}
      {section === "Appearance" ? (
        <>
          <fieldset className="space-y-3">
            <legend className="mb-4 text-muted-foreground text-sm">
              Color mode
            </legend>
            {["light", "dark", "system"].map((mode) => (
              <label
                className="flex cursor-pointer items-center justify-between border-b py-3 capitalize"
                key={mode}
              >
                <span>{mode}</span>
                <input
                  checked={theme === mode}
                  className="accent-primary"
                  name="settings-theme"
                  onChange={() => setTheme(mode)}
                  type="radio"
                  value={mode}
                />
              </label>
            ))}
          </fieldset>
          <p className="mt-7 text-muted-foreground text-sm">
            Choose page styles from Themes in the toolbar.
          </p>
        </>
      ) : null}
      {section === "Sound" ? (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <label htmlFor="ui-sound-enabled">UI sounds</label>
            <Switch
              checked={!sound.muted}
              id="ui-sound-enabled"
              onCheckedChange={(enabled) =>
                setSound(setSoundPreference({ ...sound, muted: !enabled }))
              }
            />
          </div>
          <div className="space-y-4">
            <label
              className="flex justify-between text-sm"
              htmlFor="ui-sound-volume"
            >
              Volume{" "}
              <span className="text-muted-foreground">
                {Math.round(sound.volume * 100)}%
              </span>
            </label>
            <input
              aria-label="UI sound volume"
              className="w-full accent-primary"
              id="ui-sound-volume"
              max="100"
              min="0"
              onChange={(event) =>
                setSound(
                  setSoundPreference({
                    ...sound,
                    volume: Number(event.target.value) / 100,
                  })
                )
              }
              type="range"
              value={Math.round(sound.volume * 100)}
            />
          </div>
          <Button
            disabled={sound.muted || sound.volume === 0}
            onClick={() => playUiSound("notification-success")}
            variant="outline"
          >
            Test sound
          </Button>
        </div>
      ) : null}
      {section === "Document details" ? details : null}
    </section>
  );
}
