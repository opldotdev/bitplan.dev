#!/usr/bin/env bash
set -euo pipefail
# Creates one disposable hosted test draft on the supplied origin.
session="name-entry-check-$$"
trap 'agent-browser --session "$session" close >/dev/null 2>&1 || true' EXIT
agent-browser --session "$session" open "${1:-http://localhost:3000}/new" >/dev/null
agent-browser --session "$session" set viewport 390 844
agent-browser --session "$session" wait '#shared-draft-title'
agent-browser --session "$session" wait --fn 'document.activeElement?.id === "shared-draft-title" && document.querySelector("button[type=submit]")?.disabled === true'
agent-browser --session "$session" wait --fn 'Boolean(document.querySelector("iframe[srcdoc]"))'
agent-browser --session "$session" fill '#shared-draft-title' 'Naming flow check'
agent-browser --session "$session" press Enter
agent-browser --session "$session" wait 'input[value="terminal"]'
agent-browser --session "$session" check 'input[value="terminal"]'
agent-browser --session "$session" find role button click --name 'Back' --exact
agent-browser --session "$session" wait --fn 'document.querySelector("#shared-draft-title")?.value === "Naming flow check"'
agent-browser --session "$session" press Enter
agent-browser --session "$session" wait --fn 'document.querySelector("input[value=terminal]")?.checked === true'
agent-browser --session "$session" set offline on
agent-browser --session "$session" find role button click --name 'Start with Naming flow check'
agent-browser --session "$session" wait '[role="alert"]'
agent-browser --session "$session" wait --fn 'document.querySelector("input[value=terminal]")?.checked === true && document.querySelector("button[type=submit]")?.disabled === false'
agent-browser --session "$session" set offline off
agent-browser --session "$session" focus 'button[type=submit]'
agent-browser --session "$session" press Enter
agent-browser --session "$session" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"'
agent-browser --session "$session" wait --fn '!document.querySelector("[role=dialog]") && document.querySelector("iframe[title=\"Naming flow check\"]") !== null'
