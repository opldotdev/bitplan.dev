#!/usr/bin/env bash
set -euo pipefail
# Creates one hosted Brief test plan to exercise the questionnaire in the viewer.
session="template-decisions-check-$$"
trap 'agent-browser --session "$session" close >/dev/null 2>&1 || true' EXIT
origin="${1:-http://localhost:3000}"
agent-browser --session "$session" open "$origin/new" >/dev/null
agent-browser --session "$session" wait '#shared-draft-title'
agent-browser --session "$session" find role button click --name 'Skip' --exact
agent-browser --session "$session" find role button click --name 'Start with Master Plan' --exact
agent-browser --session "$session" wait 'button[aria-label="Rename Master Plan"]'
# Fresh AX references work across the sandboxed srcdoc boundary.
snapshot=$(agent-browser --session "$session" snapshot -i)
! printf '%s\n' "$snapshot" | rg 'radio .*checked=true'
radio=$(printf '%s\n' "$snapshot" | sed -n '/radio "Clarify the goal/s/.*ref=\(e[0-9]*\).*/@\1/p')
notes=$(printf '%s\n' "$snapshot" | sed -n '/textbox "Anything else?"/s/.*ref=\(e[0-9]*\).*/@\1/p')
copy=$(printf '%s\n' "$snapshot" | sed -n '/button "Copy my decisions"/s/.*ref=\(e[0-9]*\).*/@\1/p')
test -n "$radio" && test -n "$notes" && test -n "$copy"
agent-browser --session "$session" click "$radio"
agent-browser --session "$session" fill "$notes" 'Keep the existing annotations.'
agent-browser --session "$session" click "$copy"
for attempt in {1..20}; do
  snapshot=$(agent-browser --session "$session" snapshot -d 20)
  if printf '%s\n' "$snapshot" | rg -q 'StaticText "(Copied|Copy the selected response)'; then break; fi
  sleep 0.2
done
printf '%s\n' "$snapshot" | rg -q 'StaticText "(Copied|Copy the selected response)'
printf '%s\n' "$snapshot" | rg -q 'Clarify the goal: Agree on the outcome'
agent-browser --session "$session" open "$origin/templates/terminal.html" >/dev/null
agent-browser --session "$session" wait '#decisions'
agent-browser --session "$session" check '#bp-next-unsure'
agent-browser --session "$session" wait --fn 'document.querySelector("#bp-response").innerText.includes("Unsure: Ask for the missing evidence")'
agent-browser --session "$session" open "$origin/templates/decision.html" >/dev/null
agent-browser --session "$session" wait '#copy-agent-prompt'
agent-browser --session "$session" wait --fn 'document.querySelectorAll("input[type=radio]:checked").length === 0 && document.querySelector("#agent-prompt").value.includes("not live annotations") && !document.querySelector("#agent-prompt").value.includes("#k=")'
agent-browser --session "$session" click '#copy-agent-prompt'
agent-browser --session "$session" wait --fn 'document.querySelector("#agent-copy-status").textContent.includes("secret keys")'
