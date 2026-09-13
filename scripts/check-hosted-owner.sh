#!/usr/bin/env bash
set -euo pipefail
# Creates one disposable hosted draft. No wallet signing or on-chain spend.
site="${1:-http://localhost:3000}"
author="hosted-owner-$$"
reader="hosted-reader-$$"
trap 'printf "Hosted ownership check failed at line %s\n" "$LINENO" >&2' ERR
trap 'agent-browser --session "$author" close >/dev/null 2>&1 || true; agent-browser --session "$reader" close >/dev/null 2>&1 || true' EXIT
agent-browser --session "$author" open "$site/new" >/dev/null
agent-browser --session "$author" wait '#shared-draft-title' >/dev/null
agent-browser --session "$author" fill '#shared-draft-title' 'Hosted ownership check' >/dev/null
agent-browser --session "$author" find role button click --name Continue --exact >/dev/null
agent-browser --session "$author" find role button click --name 'Start with Hosted ownership check' --exact >/dev/null
agent-browser --session "$author" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"' >/dev/null
invitation=$(agent-browser --session "$author" get url)
agent-browser --session "$reader" open "$invitation" >/dev/null
agent-browser --session "$reader" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"' >/dev/null
agent-browser --session "$reader" find role button click --name Publish --exact >/dev/null
agent-browser --session "$reader" wait '#bitplan-annotations' >/dev/null
agent-browser --session "$reader" snapshot -i | rg -q 'heading "Your contributions"'
if agent-browser --session "$reader" snapshot -i | rg -q 'Save current document'; then exit 1; fi
agent-browser --session "$author" find role button click --name 'Dismiss annotation tutorial' --exact >/dev/null
heading=$(agent-browser --session "$author" snapshot -i | sed -n 's/.*heading "Start with a clear brief\.".*ref=\(e[0-9]*\).*/@\1/p')
test -n "$heading"
agent-browser --session "$author" dblclick "$heading" >/dev/null
agent-browser --session "$author" type "$heading" ' Version two verified' >/dev/null
agent-browser --session "$author" press Enter >/dev/null
for attempt in {1..15}; do
  if agent-browser --session "$reader" snapshot -i | rg -q 'heading ".*Version two verified'; then break; fi
  sleep 1
done
agent-browser --session "$reader" snapshot -i | rg -q 'heading ".*Version two verified'
agent-browser --session "$author" find role button click --name Publish --exact >/dev/null
agent-browser --session "$author" wait --fn 'Math.abs(document.querySelector("[data-slot=sidebar-container]").getBoundingClientRect().right-innerWidth)<1' >/dev/null
agent-browser --session "$author" find role button click --name 'Save current document' --exact >/dev/null
agent-browser --session "$author" wait '[aria-label="Version 2, latest"]' >/dev/null
agent-browser --session "$author" reload >/dev/null
agent-browser --session "$author" wait '[aria-label="Version 2, latest"]' >/dev/null
agent-browser --session "$author" find role button click --name Publish --exact >/dev/null
agent-browser --session "$author" wait --fn 'Array.from(document.querySelectorAll("button")).some(b => b.textContent === "Save current document")' >/dev/null
agent-browser --session "$author" snapshot -i | rg -q 'Save current document'
agent-browser --session "$reader" reload >/dev/null
agent-browser --session "$reader" wait '[aria-label="Version 2, latest"]' >/dev/null
agent-browser --session "$reader" snapshot -i | rg -q 'heading ".*Version two verified'
printf 'Creator authority survives reload; shared reader stays a contributor; live edit survives hosted v2 and decrypts for the reader.\n'
