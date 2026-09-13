#!/usr/bin/env bash
set -euo pipefail
# Pass a wallet-encrypted plan URL. The wallet must already authorize this origin.
# Read-only: no contact upload, share action, or transaction.
plan_url="${1:?Pass an authorized wallet-encrypted plan URL}"
session="private-contacts-check-$$"
trap 'agent-browser --session "$session" close >/dev/null 2>&1 || true' EXIT
agent-browser --session "$session" open "$plan_url" >/dev/null
agent-browser --session "$session" wait 'iframe' >/dev/null
agent-browser --session "$session" find role button click --name Share --exact >/dev/null
agent-browser --session "$session" snapshot -i >/dev/null
agent-browser --session "$session" find role tab click --name 'Private copy' --exact >/dev/null
# No unlock/refresh click: connected-wallet contacts must load on entry.
agent-browser --session "$session" wait '[aria-label="Your private contacts"][data-state="ready"], [aria-label="Your private contacts"][data-state="missing"]' >/dev/null
agent-browser --session "$session" find role button click --name 'About private sharing' --exact >/dev/null
agent-browser --session "$session" wait --text 'Earlier links keep working.' >/dev/null
printf 'Connected-wallet contacts load automatically; sharing details open from the info icon.\n'
