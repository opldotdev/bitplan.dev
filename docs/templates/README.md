# Plan templates

Reference HTML for plans published with BitPlan. Copy a template, replace the
content, keep the mechanics. These files are the source the skill package
(OPL-4328) ships as references.

## The rules every template satisfies

Learned the hard way over five drafts of one plan.

1. **One file, nothing external.** No script `src`, no stylesheet links, no
   fonts from a CDN. Inline everything. Images may point at on-chain assets on
   an ORDFS gateway, which are immutable, or be inlined as `data:` URIs.
2. **Renders with scripts off and on.** The viewer allows inline scripts but
   denies the page any network. Older viewers and some embedded browsers run
   plans with scripts off. Every interaction must degrade: the response block
   fills in from radio selections with CSS alone, and the copy button copies
   with a script or selects the block for manual copy without one.
3. **Copy must actually work.** Try `navigator.clipboard.writeText` first,
   then `document.execCommand("copy")` on a selection, then select-all so the
   reader can copy by hand. Say which one happened on the button.
4. **Open decisions are questions.** Ask only when a real unresolved choice
   changes the work. Each question has a one-line reason it matters, two to
   four options, an Unsure option, and a plain-language
   consequence for every option. Never manufacture a questionnaire.
   Comprehensive comparisons keep options equally weighted, with attributed
   recommendations separate. Unsure names an evidence check, not a default.
5. **The handoff is the deliverable.** If there are open decisions, end with a
   response block that names the plan, draft number, origin, each answer, and
   notes. If the choices are settled, end with a copyable implementation brief
   containing the repository, scope, constraints, and done conditions.
6. **Plain English.** Explain a protocol the first time it appears. No
   version numbers in the names of things people use. Short sentences.
7. **Theme-aware.** Light and dark through `prefers-color-scheme`, colors
   on `:root` tokens only.
8. **Says what it is.** Eyebrow with product, draft number, and date. A lede
   that a stranger understands. A "what changed since the last draft" list when
   there was a last draft. A closing line that says the work is not built yet.
9. **Fits the limit.** Under the plan size limit with everything inlined.
   Check with `wc -c`.
10. **Same file, new version.** Republishing the same path updates the same
    origin. Do not rename the file between drafts.

## Templates

For substantial proposals and marketing showcases, lead with a visual thesis:
show the mechanism beside the outcome, not a large title followed by a wall of
prose. The comprehensive template includes an adaptable diagram-led hero.
Use a flow, layered view, timeline, or comparison when it explains the subject;
use charts only with genuine quantities, units, and sources. Vary composition
instead of filling every section with identical cards. Keep the minimal format
for small tasks. Illustrative UI and future states must be labeled, and every
visual needs readable labels, theme support, and a narrow-screen treatment.

- `plan.html`: design plan with a decisions questionnaire and a response block.
- `proposal.html`: comprehensive visual proposal, adapted from the visual-proposal
  skill. Includes sticky section navigation, contextual human notes, a diagram,
  an evidence table, native detail disclosures, optional review panels,
  milestones, theme controls, and a versioned decision handoff.

The minimal template remains appropriate for short plans. The comprehensive
template is an illustrative component set, not a requirement to fill every
section. Replace its scenario and metadata. Remove unused panels and never
invent reviews, roster identities, scores, or agreement. Embed chosen portraits
directly so they remain readable without scripts or external image requests.
For settled decisions, replace the questionnaire with an implementation brief.

Keep stable section and annotation IDs. Contextual notes preserve attribution
and the source version; they do not implement shared editing or presence.
The navbar character chooser belongs to the host app, not the HTML.
Character selection survives plan versions and does not make a transaction.
Publishing annotations must remain distinct from replacing the plan document.

## Plans with live or archived annotations

The template is document content; the host owns collaboration, credentials,
the avatar popover, and the annotation layer. Keep stable section IDs and
readable headings so tools can target a section without guessing coordinates.
The shared viewer provides the same annotation tools to every template after
joining a collaboration room; do not embed another annotation UI in the HTML.
Right-click opens a compact text/image toolbar, with Copy selected text and
Copy link only when applicable. Text and image composers open at the chosen
anchor. PNG, JPEG, WebP, GIF, and SVG uploads are embedded in encrypted notes
(170 KB upload limit). SVG is rendered only as an image, never inline markup.
Authors can resize their own cards by dragging the corner or using its arrow
keys. Saved dimensions synchronize through Convex and survive reloads; they do
not change the document anchor or create a transaction. Existing notes without
dimensions use the default card size. These are viewer features: a standalone
downloaded HTML file does not carry the live overlay or its credentials.
React-authored plans must be built into self-contained HTML with bundled inline
scripts and a readable scripts-off fallback. Uploading JSX or a Next.js project
is not supported, and remote runtime imports are not allowed.

Reconstruct a published view from the exact document version and the exact
annotation heads in its recovery manifest. Verify hashes, then compose notes
outside the sandboxed document. Preserve attribution, resolved notes, original
targets, and missing-reference warnings. Do not silently load today's layers
over yesterday's document or describe a document-only HTML fetch as complete.
For a static export, render an explicitly labeled annotation appendix with
links to stable sections; keep original document and checkpoint references.

The current template's response button is a copy fallback, not live delivery.
“Submit to agent” must only appear as working when the host provides a durable
addressed request channel and acknowledgement. Do not embed room credentials or
an independent network client in a template. Future section-read animations
must reflect real tool activity, expire promptly, and respect reduced motion.

Before delivery, check both themes, narrow widths, keyboard controls, scripts
disabled, changed answers, notes, and denied clipboard access. Keep visible
metadata, data attributes, and static response stamps synchronized. Never
derive the origin from the reader URL, which can contain private credentials.

Run the automated template check with:

```sh
bun test packages/cli/test/proposal-template.test.ts
```

## Publishing

```sh
npx bitplan upload docs/templates/plan.html --description "Draft 1"
```

Only the latest draft is published by default when a hosted plan is inscribed.
Use `--all-versions` to write the whole history to the chain.
