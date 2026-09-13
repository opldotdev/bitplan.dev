#!/usr/bin/env bash
set -euo pipefail
# Supply a readable collaboration invitation, never a committed credential.
session="annotation-menu-check-$$"
trap 'agent-browser --session "$session" close >/dev/null 2>&1 || true' EXIT
agent-browser --session "$session" open "${1:?Pass a collaboration invitation}" >/dev/null
agent-browser --session "$session" set viewport 1280 900
agent-browser --session "$session" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"'
agent-browser --session "$session" mouse move 400 300
agent-browser --session "$session" mouse down right
agent-browser --session "$session" mouse up right
agent-browser --session "$session" wait '[role="menuitem"][aria-label="Add text annotation"]'
agent-browser --session "$session" find role menuitem click --name 'Use browser right-click menu'
agent-browser --session "$session" wait --fn '!document.querySelector("[role=menuitem]")'
agent-browser --session "$session" mouse down right
agent-browser --session "$session" mouse up right
agent-browser --session "$session" wait --fn '!document.querySelector("[role=menuitem]")'
agent-browser --session "$session" press Escape
agent-browser --session "$session" find first 'button[aria-controls="bitplan-annotations"]' click
agent-browser --session "$session" wait 'input[type="checkbox"]'
agent-browser --session "$session" click 'input[type="checkbox"]'
agent-browser --session "$session" find role button click --name 'Close annotations'
agent-browser --session "$session" mouse move 400 300
agent-browser --session "$session" mouse down right
agent-browser --session "$session" mouse up right
agent-browser --session "$session" wait '[role="menuitem"][aria-label="Add text annotation"]'
