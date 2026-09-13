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
8. **Says what matters once.** Use sentence-case labels and a lede a stranger
   understands. Do not repeat the host's branding or version, stack slogans,
   or caption obvious artwork. Keep revision notes in one disclosure and label
   genuinely unfinished features accurately. Do not add a boilerplate footer
   claiming that shipped work is unbuilt.
9. **Fits the limit.** Under the plan size limit with everything inlined.
   Check with `wc -c`.
10. **Same file, new version.** Republishing the same path updates the same
    origin. Do not rename the file between drafts.

## Templates

- `blank.html`: an empty white sheet in light mode and a matte chalkboard in
  dark mode. No placeholder copy, fake notes, or embedded editor. Join a live
  collaboration room to use the viewer's annotation tools on it.
- `brief.html`: a warm editorial brief with two columns and embedded paper artwork.
- `terminal.html`: a technical walkthrough with monochrome dither artwork.

The player's Appearance picker can restyle an existing document locally. Blank
removes decorative background artwork but never deletes text, images, or notes.
Use the empty starter when creating a genuinely blank document. Appearance
preferences do not publish a new version or modify shared document contents.

Brief, Terminal, and Editorial include a private-sharing walkthrough: complete
reader links and collaboration invitations are bearer credentials. For sensitive
work, create a new wallet-encrypted plan with `--share-with <contact>` and no
`--link`. An existing draft may retain previous reader-link recipients even if
`--link` is omitted. Have the agent verify the public identity key with the
operator before `contact set`; never request private keys or wallet passwords.
Blank intentionally remains empty; the viewer supplies its onboarding.

For substantial proposals and marketing showcases, lead with a visual thesis:
show the mechanism beside the outcome, not a large title followed by a wall of
prose. The comprehensive template includes an adaptable diagram-led hero.
Use a flow, layered view, timeline, or comparison when it explains the subject;
use charts only with genuine quantities, units, and sources. Vary composition
instead of filling every section with identical cards. Keep the minimal format
for small tasks. Illustrative UI and future states must be labeled, and every
visual needs readable labels, theme support, and a narrow-screen treatment.

- `plan.html`: design plan with a decisions questionnaire and a response block.
- `editorial.html`: magazine-style showcase with a serif hero, real raster
  artwork, narrative column, reference margin, and dismissible local demo notes.
  Replace the sample facts. Demo notes are document examples, never shared
  contributions. Embed externally referenced artwork for archival delivery.
- `proposal.html`: comprehensive visual proposal, adapted from the visual-proposal
  skill. Includes sticky section navigation, contextual human notes, a diagram,
  an evidence table, native detail disclosures, optional review panels,
  milestones, theme controls, and a versioned decision handoff.
- `components.html`: editorial component gallery with serif headlines, a
  before/after spread, impact map, annotated figure, evidence ledger, and
  checkpoint timeline. Adapt useful compositions to actual facts; omit filler.

## Links in the viewer

Use `href="#stable-section-id"` for section navigation, and absolute HTTPS URLs
with `target="_blank" rel="noopener noreferrer"` for external pages. The host
scrolls local anchors directly because native `srcdoc` fragment navigation can
load the host page inside itself. Avoid relative page URLs, `<base>`, routers,
and `location` assignments. Test the hero CTA, section links, and outside links
inside the real viewer as well as the standalone export. Keep the sandbox and
CSP intact. A private reader invitation must not be embedded in document content.

The minimal template remains appropriate for short plans. The comprehensive
template is an illustrative component set, not a requirement to fill every
section. Replace its scenario and metadata. Remove unused panels and never
invent completed reviews, roster identities, scores, or agreement. A fast draft
may role-play opposing positions using roster characters: visibly label the
section and every card “Simulated perspective · single author.” Separate agents
provide independent review only when they actually participate. Use strong
cases, specific rebuttals, a premise challenge, and assessment with observable
“would change my mind” conditions. Keep options equally weighted and leave the
decision to the human. Simulated characters are not live collaborators or
endorsements. Skip the panel when there is no unresolved decision. Embed chosen portraits
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
anchor.
Text composers have no submit button: Enter saves and closes, Shift+Enter adds
a line, and Escape cancels. Failed saves retain the text; IME confirmation does
not submit a note. Image uploads keep an explicit Save control.
The image picker offers Photos, Stickers, and Draw. Raster files up to 20 MB
are resized locally to fit 170 KB; SVG/GIF must already fit 170 KB. Draw supports
pen, rectangle, ellipse, color, and lasso/move, then exports a transparent image.
It is a picker drawing surface, not direct-on-document drawing or a persistent
vector editor. Choose Use image, then save the annotation. Uploaded image bytes
are embedded in encrypted notes. SVG is rendered as an image, never inline markup.
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

Before rewriting a plan, read its latest document and accessible annotations
together. Use notes and references as revision cues, not automatic authority.
Record which feedback was incorporated, deferred, or needs clarification; retain
note IDs, attribution, and original version targets. Recheck for new changes
before publishing and state the review cutoff. A document-only fetch does not
include overlays. Disclose unavailable annotations rather than claiming that
all feedback was reviewed.

```sh
npx bitplan upload docs/templates/plan.html --description "Draft 1"
```

Only the latest draft is published by default when a hosted plan is inscribed.
Use `--all-versions` to write the whole history to the chain.
