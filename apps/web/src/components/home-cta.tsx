import { FilePlus2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function HomeCta() {
  return (
    <div className="mt-8 flex justify-center">
      <Button asChild className="min-w-40" size="lg">
        <Link href="/new">
          <FilePlus2 aria-hidden="true" />
          New Plan
        </Link>
      </Button>
    </div>
  );
}
