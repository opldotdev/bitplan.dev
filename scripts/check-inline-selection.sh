#!/usr/bin/env bash
set -euo pipefail
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
agent-browser --session "$author" press v >/dev/null
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
heading=$(agent-browser --session "$author" snapshot -i | sed -n 's/.*heading ".*Live edit verified.*ref=\(e[0-9]*\).*/@\1/p')
test -n "$heading"
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
printf 'Escape, selection, live text editing, deletion, and reload passed.\n'
