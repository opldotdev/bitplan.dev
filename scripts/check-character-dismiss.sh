#!/usr/bin/env bash
set -euo pipefail
# Pass a readable plan URL; never commit an invitation or reader credential.
session="character-dismiss-check-$$"
trap 'agent-browser --session "$session" close >/dev/null 2>&1 || true' EXIT
agent-browser --session "$session" open "${1:?Pass a readable plan URL}"
agent-browser --session "$session" set viewport 1280 900
agent-browser --session "$session" wait --fn 'Boolean(document.querySelector("iframe[srcdoc]"))'
agent-browser --session "$session" find first 'button[aria-label$="Change profile"]' click
agent-browser --session "$session" wait --fn 'Boolean(document.querySelector("[data-slot=popover-content]"))'
agent-browser --session "$session" eval 'document.querySelector("iframe[srcdoc]").contentWindow.focus()'
agent-browser --session "$session" wait --fn '!document.querySelector("[data-slot=popover-content]")'
