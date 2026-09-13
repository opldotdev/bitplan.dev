import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Generated sections are embedded: published plans never fetch this fragment.
const root = resolve(import.meta.dir, "..");
const fragment = readFileSync(resolve(root, "docs/templates/shared-planning.fragment.html"), "utf8").trim();
export const templates = ["brief", "terminal", "decision", "plan", "proposal", "editorial", "components"];
for (const name of templates) {
  const source = resolve(root, `docs/templates/${name}.html`);
  for (const path of [source, resolve(root, `apps/web/public/templates/${name}.html`)]) {
  let html = readFileSync(path, "utf8");
  const block = /<!-- bitplan-visuals:start -->[\s\S]*?<!-- bitplan-visuals:end -->/;
  if (block.test(html)) html = html.replace(block, () => fragment);
  else {
    const at = html.includes("</main>") ? html.lastIndexOf("</main>") : html.lastIndexOf("</body>");
    if (at < 0) throw new Error(`Missing main in ${name}`);
    html = html.slice(0, at) + fragment + "\n" + html.slice(at);
  }
    if (process.argv.includes("--check")) {
      if (readFileSync(path, "utf8") !== html) throw new Error(`Out of sync: ${path}`);
    } else writeFileSync(path, html);
  }
}
