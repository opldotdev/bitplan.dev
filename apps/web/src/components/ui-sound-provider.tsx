"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import {
  playUiHoverSound,
  playUiSound,
  type UiSoundName,
  unlockUiSound,
} from "@/lib/ui-sound";

const OVERLAYS: Array<{
  slot: string;
  open: UiSoundName;
  close: UiSoundName;
}> = [
  { close: "modal-close", open: "modal-open", slot: "dialog-content" },
  { close: "nav-menu-close", open: "nav-menu-open", slot: "sheet-content" },
  { close: "dropdown-close", open: "dropdown-open", slot: "select-content" },
];

function closestElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest("a,button,[data-slot]")
    : null;
}

function isDisabled(element: HTMLElement): boolean {
  return (
    element.closest("[disabled], [aria-disabled='true'], [data-disabled]") !==
    null
  );
}

function isPrimaryNav(element: HTMLElement): boolean {
  return Boolean(
    element.closest('nav[aria-label="Primary"], [aria-label="Documentation"]')
  );
}

function hoverSound(element: HTMLElement): UiSoundName | null {
  const slot = element.getAttribute("data-slot");
  if (
    slot === "button" ||
    slot === "command-item" ||
    slot === "sidebar-menu-button" ||
    element.tagName === "A" ||
    element.tagName === "BUTTON"
  ) {
    return isPrimaryNav(element) ? "nav-item-hover" : "item-hover";
  }
  return null;
}

function clickSound(element: HTMLElement): UiSoundName | null {
  if (
    element.closest(
      "[data-slot='sheet-trigger'], [data-slot='dialog-trigger'], [aria-haspopup='dialog'], [aria-haspopup='menu']"
    )
  ) {
    return null;
  }
  if (element.getAttribute("aria-label") === "Toggle theme") {
    const isDark = document.documentElement.classList.contains("dark");
    return isDark ? "toggle-off" : "toggle-on";
  }
  if (element.closest("[data-slot='checkbox']")) {
    const box = element.closest("[data-slot='checkbox']");
    const checked =
      box?.getAttribute("data-checked") === "true" ||
      box?.getAttribute("aria-checked") === "true";
    return checked ? "checkbox-check" : "checkbox-uncheck";
  }
  if (element.closest("[data-slot='command-item']")) {
    return "nav-forward";
  }
  const button = element.closest("[data-slot='button']");
  if (!(button instanceof HTMLElement)) {
    return null;
  }
  const variant = button.getAttribute("data-variant");
  if (variant === "destructive") {
    return "button-click-destructive";
  }
  if (variant === "default" || variant === null) {
    return "button-click-primary";
  }
  return "button-click-secondary";
}

function wrapToasts(): () => void {
  const original = {
    error: toast.error,
    info: toast.info,
    success: toast.success,
    warning: toast.warning,
  };
  toast.success = ((...args: Parameters<typeof toast.success>) => {
    playUiSound("notification-success");
    return original.success(...args);
  }) as typeof toast.success;
  toast.error = ((...args: Parameters<typeof toast.error>) => {
    playUiSound("notification-error");
    return original.error(...args);
  }) as typeof toast.error;
  toast.warning = ((...args: Parameters<typeof toast.warning>) => {
    playUiSound("notification-warning");
    return original.warning(...args);
  }) as typeof toast.warning;
  toast.info = ((...args: Parameters<typeof toast.info>) => {
    playUiSound("notification-info");
    return original.info(...args);
  }) as typeof toast.info;
  return () => {
    toast.success = original.success;
    toast.error = original.error;
    toast.warning = original.warning;
    toast.info = original.info;
  };
}

export function UiSoundProvider() {
  useEffect(() => {
    const unlock = () => {
      unlockUiSound();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    const onClick = (event: MouseEvent) => {
      const element = closestElement(event.target);
      if (!element || isDisabled(element)) {
        return;
      }
      const sound = clickSound(element);
      if (sound) {
        playUiSound(sound);
      }
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }
      const element = closestElement(event.target);
      if (!element || isDisabled(element)) {
        return;
      }
      const related =
        event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (related && element.contains(related)) {
        return;
      }
      const sound = hoverSound(element);
      if (sound) {
        playUiHoverSound(sound, element);
      }
    };

    const counts = new Map<string, number>();
    for (const overlay of OVERLAYS) {
      counts.set(
        overlay.slot,
        document.querySelectorAll(`[data-slot='${overlay.slot}']`).length
      );
    }
    const observer = new MutationObserver(() => {
      for (const overlay of OVERLAYS) {
        const next = document.querySelectorAll(
          `[data-slot='${overlay.slot}']`
        ).length;
        const previous = counts.get(overlay.slot) ?? 0;
        if (next > previous) {
          playUiSound(overlay.open);
        } else if (next < previous) {
          playUiSound(overlay.close);
        }
        counts.set(overlay.slot, next);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("click", onClick);
    document.addEventListener("pointerover", onPointerOver);
    const unwrapToasts = wrapToasts();

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerover", onPointerOver);
      observer.disconnect();
      unwrapToasts();
    };
  }, []);

  return null;
}
