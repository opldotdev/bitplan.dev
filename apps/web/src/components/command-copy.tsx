"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const COMMAND = "npx bitplan upload ./plan.html";

export function CommandCopy() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  }, []);

  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <code className="min-w-0 flex-1 overflow-x-auto font-mono text-sm">
          {COMMAND}
        </code>
        <Button
          aria-label={copied ? "Copied" : "Copy command"}
          className="shrink-0"
          onClick={handleCopy}
          size="icon"
          type="button"
          variant="ghost"
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </CardContent>
    </Card>
  );
}
