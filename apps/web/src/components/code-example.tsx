import { codeToHtml } from "shiki";

export async function CodeExample({
  code,
  label,
}: {
  code: string;
  label: string;
}) {
  const html = await codeToHtml(code.trim(), {
    lang: "typescript",
    theme: "aurora-x",
  });

  return (
    <details className="not-typeset mt-4 overflow-hidden rounded-lg border bg-card">
      <summary className="cursor-pointer px-4 py-3 font-medium text-sm">
        {label}
      </summary>
      <div
        className="border-t text-xs [&_pre]:overflow-x-auto [&_pre]:p-4"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki renders a fixed local code string.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </details>
  );
}
