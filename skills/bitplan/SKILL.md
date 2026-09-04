---
name: bitplan
description: >
  Create, review, host, publish, update, fetch, and share encrypted HTML plans
  with BitPlan and a BRC-100 wallet. Use when asked to make a BitPlan, publish
  or update a plan, share one with a person or team, create a private reader
  link, move a hosted draft on chain, or explain bitplan.dev.
metadata:
  version: "0.2.1"
---

# BitPlan

**Skill version: 0.2.1**

BitPlan turns one self-contained HTML file into an encrypted living plan. A
BRC-100 wallet owns the keys. A draft can stay hosted as ciphertext while it
changes, then become a permanent 1Sat Ordinal when it is ready. BRC-100 is the
wallet interface, not the inscription format.

Use `bunx bitplan` or `npx bitplan`. Never install the CLI globally. Run it
from the repository the plan belongs to so BitPlan records Git metadata.

## Choose the wallet honestly

Prefer a compatible BRC-100 wallet the user already has. Check it with
`bunx bitplan auth`; do not silently create, import, or replace a wallet.

The 1Sat CLI is intended to become the local fallback wallet for agents, but
that application-facing bridge is not released yet. `1sat serve wallet`
currently serves authenticated wallet storage; it is not a drop-in endpoint
for BitPlan's BRC-100 `HTTPWalletJSON` client. Do not point BitPlan at it or
claim the fallback works until the 1Sat headless-wallet acceptance test passes.

If no compatible wallet is available, explain that BitPlan cannot create or
update an encrypted plan today. Let the calling workflow offer a local file or
an explicitly approved non-BitPlan host. Never weaken BitPlan into a plaintext
or agent-held-key mode to make the command succeed.

## Check the live product first

Before answering what BitPlan supports, read https://bitplan.dev/llms.txt and
check `bunx bitplan --help`. Check the relevant command's help too. If the
published CLI and website disagree, say so plainly instead of inventing a
fallback.

## Safety and privacy

1. Never ask for or handle a mnemonic, wallet password, or private key. The
   user unlocks and approves operations in their BRC-100 wallet.
2. Tell the user before fetching a plan they did not author. Fetching puts its
   plaintext in the agent's context.
3. A reader link is a bearer credential. Anyone with the complete link can
   read. Pass it intact, do not print its fragment separately, and do not put it
   in public logs, issues, or pull requests.
4. Hosted storage contains ciphertext and a public envelope header, not
   plaintext or wallet keys. A hosted draft still depends on bitplan.dev until
   it is inscribed.
5. On-chain versions are permanent. Removing a reader only affects the next
   version. It cannot revoke access to a version already shared.

## Choose the destination deliberately

Use a hosted draft for review and iteration. It costs no BSV:

```bash
bunx bitplan upload ./plan.html --hosted --link
```

`--link` lets a reader open the plan without a wallet. The hosted ID is only a
random locator; the private key after `#` is what decrypts the plan. Treat the
complete URL like a password.

Use wallet identities when access should follow people rather than a link:

```bash
bunx bitplan upload ./plan.html --hosted --share-with <identity-key|contact|team>
```

Use the on-chain path when the user asks for permanence or the plan is ready to
become a record:

```bash
bunx bitplan inscribe ./plan.html
```

Publishing directly on chain is also supported:

```bash
bunx bitplan upload ./plan.html
```

Do not describe a hosted plan as on chain. Do not call a 1Sat Ordinal a
"BRC-100 inscription."

## Write the plan before publishing it

Start with the template at
https://github.com/opldotdev/bitplan.dev/blob/master/docs/templates/plan.html.
Use it as a design system, not as a reason to add sections the plan does not
need.

A good BitPlan:

- names the repository, relevant issue or project, current state, and intended
  reader;
- says what is true now, what will change, what will not change, and how to
  know the work is done;
- uses plain English, short labels, and the real product names;
- uses a small diagram when it makes a relationship or sequence easier to
  understand;
- contains no secrets, local file paths, seed phrases, tokens, or private
  reader links;
- works with scripts on or off and keeps all required CSS and JavaScript in the
  one HTML file;
- states what changed when updating an existing draft;
- stays at the same file path so the hosted ID or on-chain origin remains
  stable.

Never present an idea, proposed feature, or future wallet behavior as something
that works today.

### Decisions and handoff

Ask questions only when there is a real unresolved choice that changes the
implementation. Do not manufacture a questionnaire.

For each real decision, give two to four distinct options, mark one
Recommended, include Unsure, and state the consequence of each choice. End with
a response block that fills in from the choices and can be copied back to the
agent.

If the decisions are already settled, end with a short copyable implementation
brief instead. It should contain the repository, scope, constraints, and done
conditions. That gives the next agent a useful handoff without fake choices.

## Publish and update

Authenticate if needed, then inspect the wallet identity:

```bash
bunx bitplan auth
bunx bitplan whoami --json
```

For non-interactive output, use `--json` where supported. `--json` requires
`--yes`; only add it after the user has approved the publish.

The same file path updates the same plan:

```bash
bunx bitplan upload ./plan.html --yes --json
```

Do not rename or copy the file to make a new draft unless the user explicitly
wants a separate plan. After publishing, return:

- the reader link when one was requested;
- the ordinary viewer URL for wallet readers;
- the hosted ID or on-chain origin;
- the version number;
- a one-line access summary.

## Read and organize plans

```bash
bunx bitplan list --json
bunx bitplan fetch <origin-or-url> --meta
bunx bitplan contact set <name> <identity-key>
bunx bitplan team add <team> <contact...>
```

Contacts and teams are local labels. The server does not receive their names or
membership. A contact may represent one wallet identity; give one person
multiple clear contact names when they use multiple identities.

## Common failures

- Connection or authorization error: ask the user to open and unlock the
  wallet, then retry once. Never ask for wallet secrets.
- Hosted update secret missing: this machine cannot update that hosted draft.
  A reader link does not grant write access.
- Version conflict: fetch the latest version, merge the new information, and
  update the same file.
- HTML over 5 MB: reduce inlined assets or split the plan.
- External script rejected: inline it or remove it.

## What BitPlan is not

BitPlan is not a general website host, wallet, database, or notes app. Plans are
single encrypted HTML documents. Use a normal web host for a public website or
multi-file application.
