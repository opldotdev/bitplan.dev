import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-1 items-center px-6 py-10">
      <Empty className="w-full border border-dashed">
        <EmptyHeader>
          <EmptyTitle>Page not found</EmptyTitle>
          <EmptyDescription>
            That URL is not a BitPlan page. Try <Link href="/docs">docs</Link>,
            the <Link href="/sitemap.xml">sitemap</Link>, or{" "}
            <Link href="/llms.txt">llms.txt</Link>.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/">Home</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
