import type { ReactNode } from "react";

import { DocsNav } from "@/components/docs-nav";

export function DocsShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-16">
      <aside className="hidden lg:block">
        <DocsNav />
      </aside>
      <article className="typeset min-w-0 max-w-3xl pb-20 [&_section[id]]:scroll-mt-10">
        <div className="not-typeset mb-8 lg:hidden">
          <DocsNav layout="wrap" />
        </div>
        {children}
      </article>
    </main>
  );
}
