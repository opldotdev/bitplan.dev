#!/usr/bin/env bash
set -euo pipefail
# Creates a disposable hosted Blank plan and one drawing; never publishes on chain.
# The invitation remains in process memory and is never printed.
origin="${1:-http://localhost:3000}"
author="canvas-author-$$"
reader="canvas-reader-$$"
trap 'agent-browser --session "$author" close >/dev/null 2>&1 || true; agent-browser --session "$reader" close >/dev/null 2>&1 || true' EXIT
agent-browser --session "$author" open "$origin/new" >/dev/null
agent-browser --session "$author" set viewport 1280 900
agent-browser --session "$author" wait '#shared-draft-title'
agent-browser --session "$author" fill '#shared-draft-title' 'Canvas check'
agent-browser --session "$author" find role button click --name Continue --exact
agent-browser --session "$author" click 'label:has(input[value="blank"])'
agent-browser --session "$author" find role button click --name 'Start with Canvas check' --exact
agent-browser --session "$author" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"'
agent-browser --session "$author" find role button click --name 'Dismiss annotation tutorial' --exact
invitation=$(agent-browser --session "$author" get url)
agent-browser --session "$reader" open "$invitation" >/dev/null
agent-browser --session "$reader" set viewport 1280 900
agent-browser --session "$reader" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"'
agent-browser --session "$author" mouse move 350 300
agent-browser --session "$author" keydown Shift
agent-browser --session "$author" keyup Shift
agent-browser --session "$author" find role menuitem click --name 'Draw with pen' --exact
# One drag command retains the same browser pointer capture throughout the gesture.
agent-browser --session "$author" drag '[aria-label="Draw pen on the plan"]' 'button[aria-label="Appearance"]'
agent-browser --session "$author" wait '[data-move-annotation]'
agent-browser --session "$reader" wait --fn 'document.querySelectorAll("[data-annotation-anchor] img").length === 1'
agent-browser --session "$author" drag '[data-move-annotation]' 'button[aria-controls="bitplan-annotations"]'
agent-browser --session "$author" wait --fn 'document.querySelector("[data-annotation-anchor]")?.getAttribute("aria-busy") === "false"'
placement=$(agent-browser --session "$author" eval 'document.querySelector("[data-annotation-anchor]").style.translate')
agent-browser --session "$reader" wait --fn "document.querySelector('[data-annotation-anchor]')?.style.translate === $placement"
agent-browser --session "$reader" reload >/dev/null
agent-browser --session "$reader" wait --fn "document.querySelector('[data-annotation-anchor]')?.style.translate === $placement"
printf 'Canvas drawing, live placement, and reload checks passed.\n'
