#!/usr/bin/env bash
set -euo pipefail
# Use a disposable, authorized collaboration plan: writes an attributed edit,
# restores its text, and leaves one clearly labeled HTML test annotation.
invitation="${1:?Pass an authorized DISPOSABLE BitPlan collaboration URL}"
writer="passage-writer-$$"
observer="passage-observer-$$"
trap 'agent-browser --session "$writer" close >/dev/null 2>&1 || true; agent-browser --session "$observer" close >/dev/null 2>&1 || true' EXIT
for session in "$writer" "$observer"; do
  agent-browser --session "$session" open "$invitation" >/dev/null
  agent-browser --session "$session" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"' >/dev/null
done
agent-browser --session "$writer" eval '(async()=>{const m=document.modelContext??navigator.modelContext;const tools=await m.getTools();const run=async(name,args)=>{const raw=await m.executeTool(tools.find(t=>t.name===name),JSON.stringify(args));return typeof raw==="string"?JSON.parse(raw):raw;};const state=await run("read_bitplan_collaboration",{});let section;for(const s of state.sections){section=await run("read_bitplan_section",{domPath:s.domPath});if(section.passages.length)break;}const p=section.passages[0];const input={path:p.path,text:p.text+" [WebMCP check]",revision:p.revision,target:section.target,documentRevision:section.documentRevision};const saved=await run("edit_bitplan_text",input);let rejected=false;try{await run("edit_bitplan_text",input);}catch{rejected=true;}if(!rejected)throw Error("Stale edit accepted");await run("edit_bitplan_text",{...input,text:p.text,revision:saved.revision});await run("annotate_bitplan",{anchor:section.anchor,content:{type:"html",html:"<strong>WebMCP overlay check</strong>"},size:{width:320,height:160}});return true;})()' | rg -q true
agent-browser --session "$observer" wait --fn 'document.querySelector("iframe[title=\"HTML annotation\"]")' >/dev/null
printf 'Scoped edit, stale rejection, restoration, and HTML overlay completed; inspect the second viewer for live delivery.\n'
