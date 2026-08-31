---
name: bitplan
description: Publish, list, fetch, and share encrypted HTML plans with a BRC-100 wallet.
---

# BitPlan

Use BitPlan when the user wants an encrypted, versioned plan tied to the current Git repository. Run it from that repository so BitPlan records repository metadata automatically.

## Requirements

- Use `npx bitplan` or `bunx bitplan`; do not install it globally.
- Connect only through the user's BRC-100 wallet. Never request or handle a mnemonic.
- Treat the plan as private unless the user explicitly supplies a reader identity key.

## Workflow

1. Write the plan as a self-contained HTML file without secrets or machine-specific paths.
2. Run `npx bitplan auth` if the wallet is not connected.
3. Publish with `npx bitplan upload ./plan.html`. In a non-interactive agent shell, add `--yes` only after the user has approved the publish.
4. Return the origin and `https://bitplan.dev/d/<origin>` URL.

Use `npx bitplan list` to find drafts, `npx bitplan fetch <origin>` to decrypt one, and `--share-with <identity-key>` only when the user asks to share. Uploads notify 1Sat for ORDFS capture by default; use `--no-relay` only when requested.

## Browser agents

When WebMCP is available, call `start_bitplan_plan` to open the composer, then call `prepare_bitplan_plan` with `title`, `body`, and an optional HTTPS `repository`. The second tool validates the input and opens the exact review preview. It never connects a wallet or publishes; leave the irreversible publish action to the user and their wallet.

Documentation: https://bitplan.dev/docs/commands
