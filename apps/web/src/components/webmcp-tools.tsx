"use client";

import { useEffect } from "react";

interface ModelContext {
  registerTool: (
    tool: {
      description: string;
      execute: () => { status: string; url: string };
      inputSchema: Record<string, unknown>;
      name: string;
      title: string;
    },
    options?: { signal: AbortSignal }
  ) => Promise<unknown> | unknown;
}

export function WebMcpTools() {
  useEffect(() => {
    const modelContext =
      (document as Document & { modelContext?: ModelContext }).modelContext ??
      (navigator as Navigator & { modelContext?: ModelContext }).modelContext;

    if (!modelContext) {
      return;
    }

    const controller = new AbortController();
    const url = new URL("/new", window.location.origin).toString();

    Promise.resolve(
      modelContext.registerTool(
        {
          description:
            "Open BitPlan's plan composer. This only navigates to the form; it does not connect a wallet or publish anything.",
          execute: () => {
            window.location.assign(url);
            return { status: "opened", url };
          },
          inputSchema: { additionalProperties: false, type: "object" },
          name: "start_bitplan_plan",
          title: "Start a BitPlan",
        },
        { signal: controller.signal }
      )
    ).catch(() => undefined);

    return () => controller.abort();
  }, []);

  return null;
}
