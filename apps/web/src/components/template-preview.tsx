"use client";

import { useEffect, useState } from "react";

import { type PlanAppearance, planAppearanceCss } from "@/lib/plan-appearance";
import { withRenderPolicy } from "@/lib/render-policy";
import { cn } from "@/lib/utils";

export function TemplatePreview({
  className,
  dark,
  fullSize = false,
  preset,
}: {
  className?: string;
  dark: boolean;
  fullSize?: boolean;
  preset: PlanAppearance;
}) {
  const [html, setHtml] = useState("");
  const [failed, setFailed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const controller = new AbortController();
    setHtml("");
    setFailed(false);
    fetch(`/templates/${preset.layout}.html`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Preview unavailable");
        }
        return response.text();
      })
      .then(setHtml)
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, [preset.layout]);

  const isDark = mounted && dark;
  const palette = isDark ? preset.dark : preset.light;
  return (
    <div
      className={cn(
        "pointer-events-none relative h-48 w-full overflow-hidden rounded-md",
        className
      )}
      style={{ background: palette.paper }}
    >
      {html ? (
        <iframe
          aria-hidden="true"
          sandbox=""
          srcDoc={withRenderPolicy(
            html,
            `<style>${planAppearanceCss(preset)}</style>`
          )}
          style={{
            border: 0,
            colorScheme: isDark ? "dark" : "light",
            height: fullSize ? "100%" : 1280,
            transform: fullSize ? undefined : "scale(0.15)",
            transformOrigin: "top left",
            width: fullSize ? "100%" : "666.667%",
          }}
          tabIndex={-1}
          title={`${preset.name} template preview`}
        />
      ) : (
        <span className="block p-3 text-xs" style={{ color: palette.ink }}>
          {failed ? "Preview unavailable" : "Loading preview..."}
        </span>
      )}
    </div>
  );
}
