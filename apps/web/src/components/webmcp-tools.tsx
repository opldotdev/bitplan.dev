"use client";

import { useEffect } from "react";

import type { DraftsWallet } from "@/lib/drafts";
import { listWalletDrafts } from "@/lib/drafts";
import { normalizeOrigin } from "@/lib/outpoint";
import { getConnectedWallet } from "@/lib/wallet";

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

export async function listConnectedBitplans(
  wallet: DraftsWallet | null,
  siteOrigin: string
) {
  if (!wallet) {
    return {
      connectUrl: new URL("/drafts", siteOrigin).toString(),
      message: "Open My drafts and connect your wallet first.",
      status: "wallet-not-connected",
    };
  }

  const drafts = await listWalletDrafts(wallet);
  return {
    count: drafts.length,
    plans: drafts.map(({ origin, outpoint }) => ({
      origin,
      outpoint,
      url: new URL(`/d/${origin}`, siteOrigin).toString(),
    })),
    status: "ok",
  };
}

export function bitplanViewerUrl(value: unknown, siteOrigin: string): string {
  const input =
    typeof value === "object" && value !== null && "origin" in value
      ? value.origin
      : null;
  const origin = typeof input === "string" ? normalizeOrigin(input) : null;
  if (!origin) {
    throw new Error("Enter a valid BitPlan origin outpoint.");
  }
  return new URL(`/d/${origin}`, siteOrigin).toString();
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
    const composerUrl = new URL("/new", window.location.origin).toString();
    const unregister = [
      registerWebMcpTool({
        description:
          "Open BitPlan's plan composer. This only navigates to the form; it does not connect a wallet or publish anything.",
        execute: () => {
          window.location.assign(composerUrl);
          return { status: "opened", url: composerUrl };
        },
        inputSchema: { additionalProperties: false, type: "object" },
        name: "start_bitplan_plan",
        title: "Start a BitPlan",
      }),
      registerWebMcpTool({
        description:
          "List the encrypted BitPlans held by the wallet already connected to this tab. Returns plan IDs and viewer links only. It does not connect a wallet or decrypt plan contents.",
        execute: () =>
          listConnectedBitplans(getConnectedWallet(), window.location.origin),
        inputSchema: { additionalProperties: false, type: "object" },
        name: "list_my_bitplans",
        title: "List My BitPlans",
      }),
      registerWebMcpTool({
        description:
          "Open a BitPlan in the visible viewer for review. This only navigates to the encrypted plan; it does not return decrypted contents to the agent.",
        execute: (input) => {
          const url = bitplanViewerUrl(input, window.location.origin);
          window.location.assign(url);
          return { status: "opened", url };
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            origin: {
              description: "The BitPlan origin outpoint.",
              type: "string",
            },
          },
          required: ["origin"],
          type: "object",
        },
        name: "open_bitplan",
        title: "Open a BitPlan",
      }),
    ];

    return () => {
      for (const cleanup of unregister) {
        cleanup?.();
      }
    };
  }, []);

  return null;
}
