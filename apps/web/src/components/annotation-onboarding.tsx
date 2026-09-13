"use client";

import { useEffect, useState } from "react";

const DISMISSED = "bitplan.annotation-onboarding.dismissed.v1";

/** Local tutorial chrome, never a shared annotation or published contribution. */
export function AnnotationOnboarding() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      setVisible(localStorage.getItem(DISMISSED) !== "1");
    } catch {
      // Do not repeatedly show onboarding when the preference cannot persist.
    }
  }, []);
  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Dismissal still works for this mounted viewer.
    }
  }
  if (!visible) {
    return null;
  }
  return (
    <aside
      aria-label="Annotation tutorial, only visible to you"
      className="absolute top-20 right-4 z-40 w-64 max-w-[calc(100%-2rem)] rounded-md border bg-background p-3 text-sm shadow-md"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium">Make your mark</span>
        <button
          aria-label="Dismiss annotation tutorial"
          className="rounded p-1 focus-visible:outline"
          onClick={dismiss}
          type="button"
        >
          Done
        </button>
      </div>
      <p>Add a note beside anything you want to discuss.</p>
      <p className="mt-2 text-muted-foreground text-xs">
        Click text to select; click again to edit. Right-click for annotation
        tools. Open New version to prepare a revision. Shortcuts are in the
        navbar info menu.
      </p>
    </aside>
  );
}
