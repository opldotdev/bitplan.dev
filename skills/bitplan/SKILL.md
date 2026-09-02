---
name: bitplan
description: >
  BitPlan publishes encrypted HTML plans as versioned 1Sat Ordinals on
  Bitcoin SV, with a BRC-100 wallet holding the keys. Use when asked to
  "publish this plan", "put this plan on chain", "make a bitplan", "share
  this plan with X", "give X access to the plan", "send a link to the plan",
  "make the plan private again", "read the plan at this origin", "list my
  plans", "fetch the bitplan", "update the plan", or "write a plan for
  review". Also use for questions about bitplan.dev, the bitplan envelope, or
  the bitplan CLI.
---

# BitPlan

**Skill version: 0.1.0**

BitPlan turns one self-contained HTML file into an encrypted 1Sat Ordinal.
Publishing the same file again reinscribes the same satoshi, so one origin
holds every version. A BRC-100 wallet on the user's machine encrypts, signs,
pays, and decrypts. bitplan.dev is the viewer. Nothing is stored server-side.

To install or update: `npx skills add opldotdev/bitplan.dev --skill bitplan -g`

## Read the current docs first

Before answering questions about what BitPlan can do, read
https://bitplan.dev/llms.txt. Read it again when the user asks how to do
something or whether something is supported. If the docs and live CLI output
disagree, trust the CLI. The CLI prints `--help` for every command.

## Requirements

- Node 20 or Bun. The CLI runs with `npx bitplan` or `bunx bitplan`.
- A BRC-100 wallet running on the machine and unlocked: BSV Desktop or 1Sat
  Wallet, serving on `http://127.0.0.1:3321`. The user unlocks it. You cannot.
- A few satoshis in that wallet. Publishing costs about one satoshi per
  kilobyte.
- One HTML file under 5 MB with everything inlined: no external scripts, no
  forms, no iframes. External images are allowed. Inline scripts are allowed
  and run in the viewer with no network access.

## Three rules

1. **The wallet must be unlocked, and you cannot unlock it.** If a command
   fails with a connection or authorization error, tell the user to open and
   unlock the wallet, then retry. Never ask for a seed, password, or key.
2. **Reading a plan puts its plaintext in your context.** Say so before
   fetching a plan that the user did not write, and do not paste plan
   contents into places the user did not ask for.
3. **No tool returns or accepts key material.** Identity keys are public and
   fine to show. Reader link secrets appear only as part of a link the CLI
   prints; pass the whole link on, never split it.

## Commands

Always use `--json` where it exists and parse the result. Every JSON result
prints on stdout; errors print on stderr with exit code 1.

Check the wallet:

```bash
npx bitplan whoami --json
```

Publish a new plan or a new version of one (same file path = same plan):

```bash
npx bitplan upload ./plan.html --description "One line for the list" --yes --json
```

Result fields: `published`, `kind` (`draft` for a new plan, `version` for an
update), `origin` (the permanent id), `outpoint`, `version`, `access.mode`
(`wallet-only` or `shared`), `access.readers`, `changes.added`,
`changes.removed`, `relay.state`, `viewer` (the URL to share), and `link`
(a reader link, or null).

Share with named readers, by wallet identity key, contact, or team:

```bash
npx bitplan upload ./plan.html --share-with <identity-key-or-contact> --yes --json
```

Give out a link anyone can open, kept on later versions:

```bash
npx bitplan upload ./plan.html --link --yes --json
```

The `link` field holds `https://bitplan.dev/d/<origin>#k=<secret>`. The
part after `#` never reaches a server. Anyone with the link can read.

Stop sharing on the next version:

```bash
npx bitplan upload ./plan.html --private --yes --json
```

Older versions stay readable by whoever could read them. Nothing on chain can
be deleted.

List plans this wallet holds:

```bash
npx bitplan list --json
```

Read a plan (HTML to stdout, metadata to stderr with `--meta`):

```bash
npx bitplan fetch <origin-or-viewer-url> --meta
```

A viewer URL with `#k=` opens without a wallet.

Manage local names for identity keys:

```bash
npx bitplan contact set <name> <identity-key>
npx bitplan team add <team> <contact...>
```

## Writing a plan for review

Start from the template at
https://github.com/opldotdev/bitplan.dev/blob/master/docs/templates/plan.html
and follow the rules in the README beside it. The important ones: one file
with everything inlined; works with scripts on and off; decisions are
questions with a recommended option, an Unsure option, and a stated
consequence per option; the response block at the bottom fills in as the
reader chooses and has a copy button; plain English; same file path for every
draft so the origin stays stable.

After publishing, give the user the `viewer` URL, or the `link` when they
asked for a link, and the origin. Paste the reader's response block back into
the conversation when they return it.

## Errors you will see

- `Could not connect` or `authorize`: wallet not running or locked. Ask the
  user to unlock it. Do not retry in a loop.
- `This wallet does not hold a bitplan draft with origin ...`: either another
  publish already spent the coin, or a pending wallet action is reserving it.
  Wait a minute and retry once; if it persists, the plan was published from
  elsewhere, so fetch the latest version before changing it.
- `HTML document is N bytes; maximum is 5242880 bytes`: split the plan or
  drop inlined assets.
- `External script sources are not allowed`: inline the script or remove it.

## What BitPlan is not

Not a website host, not a file store, not a notes app, and not a wallet.
Plans are single HTML documents. For a public website, use a web host.
