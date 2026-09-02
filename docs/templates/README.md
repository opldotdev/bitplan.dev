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
4. **Decisions are questions, not prose.** Each question has a one-line reason
   it matters, two to four options, one marked Recommended, an Unsure option,
   and every option states its consequence in plain words.
5. **The response block is the deliverable.** It names the plan and draft
   number, the origin, one line per decision, and free-text notes. The reader
   pastes it back to the agent. Keep the labels stable across drafts so
   answers to draft 4 still parse against draft 5.
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

- `plan.html`: design plan with a decisions questionnaire and a response block.

## Publishing

```sh
npx bitplan upload docs/templates/plan.html --description "Draft 1"
```

Only the latest draft is published by default when a hosted plan is inscribed.
Use `--all-versions` to write the whole history to the chain.
