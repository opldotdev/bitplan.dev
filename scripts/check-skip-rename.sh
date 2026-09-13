#!/usr/bin/env bash
set -euo pipefail
# Creates one hosted test draft, then checks encrypted live rename and reload.
session="skip-rename-check-$$"
reader="skip-rename-reader-$$"
trap 'agent-browser --session "$session" close >/dev/null 2>&1 || true; agent-browser --session "$reader" close >/dev/null 2>&1 || true' EXIT
agent-browser --session "$session" open "${1:-http://localhost:3000}/new" >/dev/null
agent-browser --session "$session" wait '#shared-draft-title'
agent-browser --session "$session" find role button click --name 'Skip' --exact
agent-browser --session "$session" wait 'input[value="brief"]'
agent-browser --session "$session" find role button click --name 'Start with Master Plan' --exact
agent-browser --session "$session" wait 'button[aria-label="Rename Master Plan"]'
invitation=$(agent-browser --session "$session" get url)
agent-browser --session "$reader" open "$invitation" >/dev/null
agent-browser --session "$reader" wait 'button[aria-label="Rename Master Plan"]'
agent-browser --session "$session" click 'button[aria-label="Rename Master Plan"]'
agent-browser --session "$session" fill 'input[aria-label="Plan name"]' 'Renamed together'
agent-browser --session "$session" press Enter
agent-browser --session "$reader" wait 'button[aria-label="Rename Renamed together"]'
agent-browser --session "$session" click 'button[aria-label="Rename Renamed together"]'
agent-browser --session "$session" fill 'input[aria-label="Plan name"]' 'Do not save this'
agent-browser --session "$session" press Escape
agent-browser --session "$session" wait 'button[aria-label="Rename Renamed together"]'
agent-browser --session "$session" reload >/dev/null
agent-browser --session "$session" wait 'button[aria-label="Rename Renamed together"]'
