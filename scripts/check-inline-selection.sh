#!/usr/bin/env bash
set -euo pipefail
trap 'printf "Inline editor check failed at line %s\n" "$LINENO" >&2; agent-browser --session "$reader" snapshot -i' ERR
# Disposable hosted test only. No wallet request or on-chain transaction.
origin="${1:-http://localhost:3000}"
author="inline-author-$$"
reader="inline-reader-$$"
trap 'agent-browser --session "$author" close >/dev/null 2>&1 || true; agent-browser --session "$reader" close >/dev/null 2>&1 || true' EXIT
agent-browser --session "$author" open "$origin/new" >/dev/null
agent-browser --session "$author" wait '#shared-draft-title' >/dev/null
agent-browser --session "$author" fill '#shared-draft-title' 'Inline check' >/dev/null
agent-browser --session "$author" find role button click --name Continue --exact >/dev/null
agent-browser --session "$author" find role button click --name 'Start with Inline check' --exact >/dev/null
agent-browser --session "$author" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"' >/dev/null
agent-browser --session "$author" find role button click --name 'Dismiss annotation tutorial' --exact >/dev/null
agent-browser --session "$author" press t >/dev/null
agent-browser --session "$author" snapshot -i | rg -q 'Choose an element'
agent-browser --session "$author" press Escape >/dev/null
if agent-browser --session "$author" snapshot -i | rg -q 'Choose an element'; then exit 1; fi
invitation=$(agent-browser --session "$author" get url)
agent-browser --session "$reader" open "$invitation" >/dev/null
agent-browser --session "$reader" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"' >/dev/null
agent-browser --session "$reader" find role button click --name 'Dismiss annotation tutorial' --exact >/dev/null
agent-browser --session "$author" eval '(async () => { const mc = document.modelContext ?? navigator.modelContext; const tool = (await mc.getTools()).find(t => t.name === "annotate_bitplan"); await mc.executeTool(tool, JSON.stringify({anchor:{point:{x:0.5,y:0.5},quote:{exact:"Bring your agent",prefix:"",suffix:""}},content:{type:"html",html:"<section><h2>Proposed section design</h2></section>"}})); return true; })()' >/dev/null
agent-browser --session "$reader" wait --fn 'Number(document.querySelector("[data-bitplan-sequence]")?.dataset.bitplanSequence) > 0' >/dev/null
agent-browser --session "$reader" eval '(async () => { const mc = document.modelContext ?? navigator.modelContext; const tool = (await mc.getTools()).find(t => t.name === "read_bitplan_collaboration"); const result = await mc.executeTool(tool, "{}"); const value = typeof result === "string" ? JSON.parse(result) : result; return value.annotations.some(a => a.content.type === "html" && a.anchor.quote?.exact === "Bring your agent"); })()' | rg -q true
# Hosted drafts should be editable immediately, without discovering the V shortcut.
heading=$(agent-browser --session "$author" snapshot -i | sed -n 's/.*heading "Start with a clear brief\.".*ref=\(e[0-9]*\).*/@\1/p')
test -n "$heading"
agent-browser --session "$author" click "$heading" >/dev/null
test "$(agent-browser --session "$author" get attr "$heading" contenteditable)" != 'plaintext-only'
agent-browser --session "$author" click "$heading" >/dev/null
test "$(agent-browser --session "$author" get attr "$heading" contenteditable)" = 'plaintext-only'
agent-browser --session "$author" type "$heading" 'Live edit verified' >/dev/null
agent-browser --session "$author" press Enter >/dev/null
# Snapshot polling stays bounded; each snapshot includes the document iframe.
for attempt in {1..15}; do
  if agent-browser --session "$reader" snapshot -i | rg -q 'heading ".*Live edit verified'; then break; fi
  sleep 1
done
agent-browser --session "$reader" snapshot -i | rg -q 'heading ".*Live edit verified'
reader_heading=$(agent-browser --session "$reader" snapshot -i | sed -n 's/.*heading ".*Live edit verified.*ref=\(e[0-9]*\).*/@\1/p')
test -n "$reader_heading"
agent-browser --session "$reader" get attr "$reader_heading" data-bitplan-editor | rg -q '^Edited by '
agent-browser --session "$reader" get attr "$reader_heading" style | rg -q -- '--bitplan-editor-color: hsl'
heading=$(agent-browser --session "$author" snapshot -i | sed -n 's/.*heading ".*Live edit verified.*ref=\(e[0-9]*\).*/@\1/p')
test -n "$heading"
own_label=$(agent-browser --session "$author" get attr "$heading" data-bitplan-editor)
case "$own_label" in
  ''|null|undefined|'✓ Done') ;;
  *) printf 'Unexpected own edit label: %s\n' "$own_label" >&2; exit 1 ;;
esac
agent-browser --session "$reader" click "$reader_heading" >/dev/null
test "$(agent-browser --session "$reader" get attr "$reader_heading" data-bitplan-selected)" != 'null'
agent-browser --session "$reader" eval '(()=>{const b=document.querySelector("button[aria-label=Publish]");if(b.getAttribute("aria-expanded")!=="true")b.click();})()' >/dev/null
agent-browser --session "$reader" wait --fn 'document.querySelector("button[aria-label=Publish]")?.getAttribute("aria-expanded")==="true"' >/dev/null
agent-browser --session "$reader" wait --fn 'Math.abs(document.querySelector("[data-slot=sidebar-container]").getBoundingClientRect().right-innerWidth)<1' >/dev/null
agent-browser --session "$reader" click '#view-editing-tools > summary' >/dev/null
agent-browser --session "$reader" wait --fn 'document.querySelector("#view-editing-tools")?.open === true' >/dev/null
agent-browser --session "$reader" wait '#bitplan-annotations' >/dev/null
show_edits=$(agent-browser --session "$reader" snapshot -i | sed -n 's/.*checkbox "Show live changes".*ref=\(e[0-9]*\).*/@\1/p')
test -n "$show_edits"
agent-browser --session "$reader" click "$show_edits" >/dev/null
agent-browser --session "$reader" snapshot -i | rg -q 'heading "Start with a clear brief'
show_edits=$(agent-browser --session "$reader" snapshot -i | sed -n 's/.*checkbox "Show live changes".*ref=\(e[0-9]*\).*/@\1/p')
agent-browser --session "$reader" click "$show_edits" >/dev/null
agent-browser --session "$reader" snapshot -i | rg -q 'heading ".*Live edit verified'
agent-browser --session "$reader" find role button click --name 'Close annotations' --exact >/dev/null
agent-browser --session "$author" click "$heading" >/dev/null
agent-browser --session "$author" press Delete >/dev/null
for attempt in {1..15}; do
  if ! agent-browser --session "$reader" snapshot -i | rg -q 'heading ".*Live edit verified'; then break; fi
  sleep 1
done
if agent-browser --session "$reader" snapshot -i | rg -q 'heading ".*Live edit verified'; then exit 1; fi
agent-browser --session "$reader" reload >/dev/null
agent-browser --session "$reader" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"' >/dev/null
snapshot=$(agent-browser --session "$reader" snapshot -i)
printf '%s' "$snapshot" | rg -q 'heading "Bring your agent"'
if printf '%s' "$snapshot" | rg -q 'heading ".*(Live edit verified|Start with a clear brief)'; then exit 1; fi
printf 'Escape, selection, live text editing, author attribution, original/live comparison, deletion, and reload passed.\n'
