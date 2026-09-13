#!/usr/bin/env bash
set -euo pipefail
# Pass an explicitly authorized live invitation. Read-only except transient presence.
invitation="${1:?Pass an authorized BitPlan collaboration URL}"
reader="section-reader-$$"
observer="section-observer-$$"
trap 'agent-browser --session "$reader" close >/dev/null 2>&1 || true; agent-browser --session "$observer" close >/dev/null 2>&1 || true' EXIT
for session in "$reader" "$observer"; do
  agent-browser --session "$session" open "$invitation" >/dev/null
  agent-browser --session "$session" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"' >/dev/null
done
agent-browser --session "$reader" eval '(async()=>{const m=document.modelContext??navigator.modelContext;const tools=await m.getTools();const run=async(name,args)=>{const raw=await m.executeTool(tools.find(t=>t.name===name),JSON.stringify(args));return typeof raw==="string"?JSON.parse(raw):raw;};const before=await run("read_bitplan_collaboration",{});const section=await run("read_bitplan_section",{domPath:before.sections[0].domPath});if(!section.text||section.cursor!==before.cursor||section.target.sha256!==before.target.sha256)throw Error("Invalid section read");return true;})()' | rg -q true
agent-browser --session "$observer" wait '[data-agent-reading="true"]' >/dev/null
agent-browser --session "$observer" eval 'document.querySelector("[data-agent-reading=true]").getBoundingClientRect().width>0' | rg -q true
agent-browser --session "$observer" wait --fn '!document.querySelector("[data-agent-reading=true]")' >/dev/null
printf 'Section read returned current content, reached a second viewer, and its highlight expired.\n'
