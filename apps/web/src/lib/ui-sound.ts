export const UI_SOUND_FILES = {
  "button-click-destructive": "/audio/ui/buttons/button-click-destructive.mp3",
  "button-click-primary": "/audio/ui/buttons/button-click-primary.mp3",
  "button-click-secondary": "/audio/ui/buttons/button-click-secondary.mp3",
  "checkbox-check": "/audio/ui/states/checkbox-check.mp3",
  "checkbox-uncheck": "/audio/ui/states/checkbox-uncheck.mp3",
  "dropdown-close": "/audio/ui/modals/dropdown-close.mp3",
  "dropdown-open": "/audio/ui/modals/dropdown-open.mp3",
  "item-hover": "/audio/ui/navigation/item-hover.mp3",
  "loading-complete": "/audio/ui/states/loading-complete.mp3",
  "modal-close": "/audio/ui/modals/modal-close.mp3",
  "modal-open": "/audio/ui/modals/modal-open.mp3",
  "nav-back": "/audio/ui/navigation/nav-back.mp3",
  "nav-forward": "/audio/ui/navigation/nav-forward.mp3",
  "nav-item-hover": "/audio/ui/navigation/nav-item-hover.mp3",
  "nav-menu-close": "/audio/ui/navigation/nav-menu-close.mp3",
  "nav-menu-open": "/audio/ui/navigation/nav-menu-open.mp3",
  "nav-tab-switch": "/audio/ui/navigation/nav-tab-switch.mp3",
  "notification-badge": "/audio/ui/feedback/notification-badge.mp3",
  "notification-error": "/audio/ui/feedback/notification-error.mp3",
  "notification-info": "/audio/ui/feedback/notification-info.mp3",
  "notification-success": "/audio/ui/feedback/notification-success.mp3",
  "notification-warning": "/audio/ui/feedback/notification-warning.mp3",
  "toggle-off": "/audio/ui/states/toggle-off.mp3",
  "toggle-on": "/audio/ui/states/toggle-on.mp3",
  "tx-confirmed": "/audio/ui/transactions/tx-confirmed.mp3",
  "tx-received": "/audio/ui/transactions/tx-received.mp3",
  "tx-sent": "/audio/ui/transactions/tx-sent.mp3",
} as const;

export type UiSoundName = keyof typeof UI_SOUND_FILES;

export const UI_SOUND_VOLUME = 0.3;
export const UI_SOUND_HOVER_VOLUME = 0.15;
export const UI_SOUND_HOVER_THROTTLE_MS = 150;

let unlocked = false;
let lastHoverAt = 0;
let lastHoverTarget: EventTarget | null = null;

function canUseDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function prefersReducedMotion(): boolean {
  return (
    canUseDom() && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isFinePointer(): boolean {
  return (
    canUseDom() &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

export function isUiSoundName(value: string): value is UiSoundName {
  return value in UI_SOUND_FILES;
}

export function unlockUiSound(): void {
  if (!canUseDom()) {
    return;
  }
  unlocked = true;
}

export function isUiSoundUnlocked(): boolean {
  return unlocked;
}

export function playUiSound(
  name: UiSoundName,
  options?: { volume?: number }
): void {
  if (!canUseDom() || prefersReducedMotion()) {
    return;
  }
  unlocked = true;
  try {
    const shot = new Audio(UI_SOUND_FILES[name]);
    shot.volume = options?.volume ?? UI_SOUND_VOLUME;
    shot.play().catch(() => undefined);
  } catch {
    // Audio must never block the interaction it accompanies.
  }
}

export function playUiHoverSound(name: UiSoundName, target: EventTarget): void {
  if (!isFinePointer()) {
    return;
  }
  const now = Date.now();
  if (target === lastHoverTarget) {
    return;
  }
  if (now - lastHoverAt < UI_SOUND_HOVER_THROTTLE_MS) {
    return;
  }
  lastHoverAt = now;
  lastHoverTarget = target;
  playUiSound(name, { volume: UI_SOUND_HOVER_VOLUME });
}

export function resetUiSoundForTests(): void {
  unlocked = false;
  lastHoverAt = 0;
  lastHoverTarget = null;
}
