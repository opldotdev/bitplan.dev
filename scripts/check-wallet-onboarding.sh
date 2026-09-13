#!/usr/bin/env bash
set -euo pipefail
# Creates one wallet-encrypted hosted test starter; never sends a transaction.
session="wallet-onboarding-check-$$"
trap 'agent-browser --session "$session" close >/dev/null 2>&1 || true' EXIT
origin="${1:-http://localhost:3000}"
agent-browser --session "$session" open "$origin/new" >/dev/null
agent-browser --session "$session" wait '#shared-draft-title'
agent-browser --session "$session" fill '#shared-draft-title' 'Wallet flow check'
agent-browser --session "$session" click '[role="dialog"] aside button[data-variant="default"]'
agent-browser --session "$session" wait --fn '!Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Continue")?.disabled'
agent-browser --session "$session" find role button click --name 'Continue' --exact
agent-browser --session "$session" check 'input[name="template"][value="terminal"]'
agent-browser --session "$session" wait --fn '!document.querySelector("#plan-body") && !document.querySelector("#plan-repository")'
agent-browser --session "$session" find role button click --name 'Open plan' --exact
agent-browser --session "$session" wait --fn 'location.pathname.startsWith("/d/h_") && !new URLSearchParams(location.hash.slice(1)).has("k")'
agent-browser --session "$session" wait 'iframe[title="Wallet flow check"]'
agent-browser --session "$session" wait --fn '!document.querySelector("[role=dialog]")'
agent-browser --session "$session" open "$origin" >/dev/null
agent-browser --session "$session" wait '#add-your-bot'
agent-browser --session "$session" click '#add-your-bot summary'
agent-browser --session "$session" find role button click --name 'Copy bot prompt'
agent-browser --session "$session" wait 'button[aria-label="Copy bot prompt"] svg.lucide-check'
