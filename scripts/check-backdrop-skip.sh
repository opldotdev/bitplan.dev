#!/usr/bin/env bash
set -euo pipefail
session="backdrop-skip-$$"
trap 'agent-browser --session "$session" close >/dev/null 2>&1 || true' EXIT
origin="${1:-http://localhost:3000}"
agent-browser --session "$session" open "$origin/new" >/dev/null
agent-browser --session "$session" set viewport 1477 1240
agent-browser --session "$session" wait '#shared-draft-title'
agent-browser --session "$session" mouse move 30 500
agent-browser --session "$session" mouse down
agent-browser --session "$session" mouse up
agent-browser --session "$session" wait 'input[name=template]'
agent-browser --session "$session" wait --fn 'Boolean(document.querySelector("button[aria-label=\"Dismiss wallet notice\"]"))'
agent-browser --session "$session" find role button click --name 'Dismiss wallet notice' --exact
agent-browser --session "$session" find role button click --name 'Back' --exact
agent-browser --session "$session" wait --fn 'document.querySelector("#shared-draft-title")?.value === "Master Plan" && !document.querySelector("button[aria-label=\"Dismiss wallet notice\"]")'
