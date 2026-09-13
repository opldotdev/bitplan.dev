#!/usr/bin/env bash
set -euo pipefail
trap 'printf "PDF check failed at line %s\n" "$LINENO" >&2; agent-browser --session "$session" snapshot -i' ERR
origin="${1:-http://localhost:3000}"
session="pdf-check-$$"
trap 'agent-browser --session "$session" close >/dev/null 2>&1 || true' EXIT
agent-browser --session "$session" open "$origin/new" >/dev/null
agent-browser --session "$session" set viewport 1280 1000 >/dev/null
agent-browser --session "$session" wait '#shared-draft-title' >/dev/null
agent-browser --session "$session" fill '#shared-draft-title' 'PDF check' >/dev/null
agent-browser --session "$session" find role button click --name Continue --exact >/dev/null
agent-browser --session "$session" find role button click --name 'Start with PDF check' --exact >/dev/null
agent-browser --session "$session" wait --fn 'document.querySelector("[data-bitplan-connected]")?.dataset.bitplanConnected === "true"' >/dev/null
agent-browser --session "$session" find role button click --name Publish --exact >/dev/null
agent-browser --session "$session" wait --fn '(()=>{const f=document.querySelector("iframe[title=\"PDF check\"]")?.getBoundingClientRect();const s=document.querySelector("[data-slot=sidebar-container]")?.getBoundingClientRect();return f&&s&&s.width>0&&f.right<=s.left+1;})()' >/dev/null
agent-browser --session "$session" find role button click --name 'Close annotations' --exact >/dev/null
agent-browser --session "$session" eval '(async()=>{const m=document.modelContext??navigator.modelContext;const t=(await m.getTools()).find(t=>t.name==="annotate_bitplan");await m.executeTool(t,JSON.stringify({anchor:{point:{x:.5,y:.2}},content:{type:"text",text:"PDF appendix verification"}}));return true;})()' >/dev/null
# Intercept only the final native dialog, not the production snapshot-building path.
agent-browser --session "$session" eval 'document.addEventListener("load",e=>{const f=e.target;if(f instanceof HTMLIFrameElement&&f.title==="PDF print snapshot"){f.contentWindow.print=()=>{window.pdfCheck={text:f.contentDocument.body.textContent,scripts:f.contentDocument.scripts.length,sandbox:f.getAttribute("sandbox")};f.contentWindow.dispatchEvent(new Event("afterprint"));};}},true)' >/dev/null
agent-browser --session "$session" eval '(()=>{const b=document.querySelector("button[aria-label=Publish]");if(b.getAttribute("aria-expanded")!=="true")b.click();})()' >/dev/null
agent-browser --session "$session" wait --fn 'document.querySelector("button[aria-label=Publish]")?.getAttribute("aria-expanded")==="true"' >/dev/null
agent-browser --session "$session" find role button click --name PDF --exact >/dev/null
agent-browser --session "$session" find role button click --name 'Save as PDF' --exact >/dev/null
agent-browser --session "$session" wait --fn '!!window.pdfCheck' >/dev/null
agent-browser --session "$session" eval 'pdfCheck.scripts===0&&!pdfCheck.sandbox.includes("allow-scripts")&&!pdfCheck.text.includes("PDF appendix verification")&&pdfCheck.text.includes("Bring your agent")' | rg -q true
agent-browser --session "$session" click '#pdf-annotations' >/dev/null
agent-browser --session "$session" eval 'window.pdfCheck=null' >/dev/null
agent-browser --session "$session" find role button click --name 'Save as PDF' --exact >/dev/null
agent-browser --session "$session" wait --fn '!!window.pdfCheck' >/dev/null
agent-browser --session "$session" eval 'pdfCheck.scripts===0&&pdfCheck.text.includes("PDF appendix verification")&&pdfCheck.text.includes("version 1")' | rg -q true
echo 'PDF share snapshot, optional appendix, and script isolation passed.'
