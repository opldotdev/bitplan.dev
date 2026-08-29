import { Suspense } from "react";

import { DraftResolving, DraftViewer } from "@/components/draft-viewer";

export default function DraftPage() {
  return (
    <Suspense fallback={<DraftResolving />}>
      <DraftViewer />
    </Suspense>
  );
}
