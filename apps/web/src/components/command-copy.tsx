"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function CommandCopy({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success("Copied");
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  }, [command]);

  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm">
          {command}
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
