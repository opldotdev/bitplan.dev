#!/usr/bin/env bash
set -euo pipefail
# May request wallet connection; never clicks Publish or sends a transaction.
session="wallet-onboarding-check-$$"
trap 'agent-browser --session "$session" close >/dev/null 2>&1 || true' EXIT
origin="${1:-http://localhost:3000}"
agent-browser --session "$session" open "$origin/new" >/dev/null
agent-browser --session "$session" wait '#shared-draft-title'
agent-browser --session "$session" fill '#shared-draft-title' 'Wallet flow check'
agent-browser --session "$session" find role button click --name 'Use wallet' --exact
agent-browser --session "$session" wait '#plan-title'
agent-browser --session "$session" wait --fn 'document.querySelector("[role=dialog] #plan-title")?.value === "Wallet flow check" && Boolean(document.querySelector("iframe[title=\"Brief template preview\"]"))'
agent-browser --session "$session" wait --fn '/Wallet connected|Could not connect/.test(document.querySelector("[role=status]")?.textContent ?? "")'
agent-browser --session "$session" fill '#plan-body' 'Review only. Do not publish this test.'
agent-browser --session "$session" find role button click --name 'Review plan' --exact
agent-browser --session "$session" wait '[role="dialog"] iframe[title="Plan preview"]'
agent-browser --session "$session" find role button click --name 'Edit' --exact
agent-browser --session "$session" wait --fn 'document.querySelector("#plan-body")?.value === "Review only. Do not publish this test."'
agent-browser --session "$session" open "$origin" >/dev/null
agent-browser --session "$session" wait '#add-your-bot'
agent-browser --session "$session" click '#add-your-bot summary'
agent-browser --session "$session" find role button click --name 'Copy bot prompt'
agent-browser --session "$session" wait 'button[aria-label="Copy bot prompt"] svg.lucide-check'
