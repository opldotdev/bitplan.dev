"use client";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-1 items-center px-6 py-10">
      <Empty className="w-full border border-dashed">
        <EmptyHeader>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>
            Reload this page. If it keeps happening, the viewer cannot reach the
            chain or the wallet right now.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={reset} type="button">
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
