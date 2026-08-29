"use client";

import { ChevronRightIcon, FileCode2Icon } from "lucide-react";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function CodeExample({
  code,
  filename,
  label,
}: {
  code: string;
  filename: string;
  label: string;
}) {
  const source = code.trim();

  return (
    <Collapsible className="not-typeset mt-4">
      <CollapsibleTrigger asChild>
        <Button
          className="group w-full justify-between data-[state=open]:rounded-b-none"
          variant="outline"
        >
          {label}
          <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CodeBlock
          className="rounded-t-none border-t-0"
          code={source}
          language="typescript"
        >
          <CodeBlockHeader>
            <CodeBlockTitle>
              <FileCode2Icon className="size-3.5" />
              <CodeBlockFilename>{filename}</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton
                aria-label={`Copy ${filename}`}
                title="Copy code"
              />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      </CollapsibleContent>
    </Collapsible>
  );
}
