"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  PLAN_APPEARANCES,
  type PlanAppearance,
  parsePlanAppearance,
} from "@/lib/plan-appearance";

const AppearanceContext = createContext<{
  preset: PlanAppearance | null;
  presets: PlanAppearance[];
  select: (preset: PlanAppearance | null) => void;
  add: (preset: PlanAppearance) => void;
  storageIssue: boolean;
}>({
  add: () => {
    // Replaced by ThemeProvider before consumers render.
  },
  preset: null,
  presets: PLAN_APPEARANCES,
  select: () => {
    // Replaced by ThemeProvider before consumers render.
  },
  storageIssue: false,
});

export const usePlanAppearance = () => useContext(AppearanceContext);
const STORAGE_KEY = "bitplan.appearance.v1";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preset, setPreset] = useState<PlanAppearance | null>(null);
  const [custom, setCustom] = useState<PlanAppearance[]>([]);
  const [storageIssue, setStorageIssue] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved) {
        setPreset(saved.preset ? parsePlanAppearance(saved.preset) : null);
        setCustom(
          Array.isArray(saved.custom)
            ? saved.custom.slice(0, 8).map(parsePlanAppearance)
            : []
        );
      }
    } catch {
      setStorageIssue(true);
    }
  }, []);
  function save(next: PlanAppearance | null, entries: PlanAppearance[]) {
    setPreset(next);
    setCustom(entries);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ custom: entries, preset: next })
      );
      setStorageIssue(false);
    } catch {
      setStorageIssue(true);
    }
  }
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
    >
      <AppearanceContext.Provider
        value={{
          add: (next) => {
            const checked = parsePlanAppearance(next);
            if (PLAN_APPEARANCES.some((item) => item.name === checked.name)) {
              throw new Error(
                "Choose a name other than Brief, Terminal, or Blank."
              );
            }
            const entries = custom.filter((item) => item.name !== checked.name);
            if (entries.length >= 8) {
              throw new Error(
                "You can keep up to eight custom templates in this browser."
              );
            }
            save(preset, [...entries, checked]);
          },
          preset,
          presets: [...PLAN_APPEARANCES, ...custom],
          select: (next) =>
            save(next ? parsePlanAppearance(next) : null, custom),
          storageIssue,
        }}
      >
        {children}
      </AppearanceContext.Provider>
    </NextThemesProvider>
  );
}
