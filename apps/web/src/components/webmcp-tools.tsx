"use client";

import { useEffect } from "react";

interface ModelContext {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal: AbortSignal }
  ) => Promise<unknown> | unknown;
}

export interface WebMcpTool {
  description: string;
  execute: (input: unknown) => unknown;
  inputSchema: Record<string, unknown>;
  name: string;
  title: string;
}

export function registerWebMcpTool(tool: WebMcpTool): (() => void) | undefined {
  const modelContext =
    (document as Document & { modelContext?: ModelContext }).modelContext ??
    (navigator as Navigator & { modelContext?: ModelContext }).modelContext;

  if (!modelContext) {
    return;
  }

  const controller = new AbortController();
  Promise.resolve(
    modelContext.registerTool(tool, { signal: controller.signal })
  ).catch(() => undefined);
  return () => controller.abort();
}

export function WebMcpTools() {
  useEffect(() => {
    const url = new URL("/new", window.location.origin).toString();
    return registerWebMcpTool({
      description:
        "Open BitPlan's plan composer. This only navigates to the form; it does not connect a wallet or publish anything.",
      execute: () => {
        window.location.assign(url);
        return { status: "opened", url };
      },
      inputSchema: { additionalProperties: false, type: "object" },
      name: "start_bitplan_plan",
      title: "Start a BitPlan",
    });
  }, []);

  return null;
}
