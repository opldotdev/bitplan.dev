# BitPlan

Create private, versioned HTML plans. Keep them hosted while they change, then
publish them on Bitcoin when they should be permanent.

[Open BitPlan](https://bitplan.dev) · [Read the docs](https://bitplan.dev/docs) · [Install the CLI](https://www.npmjs.com/package/bitplan)

BitPlan turns a self-contained HTML file into an encrypted plan. BRC-100 is the
interface BitPlan uses to ask your wallet to encrypt and decrypt. Hosted drafts
store only ciphertext on bitplan.dev and cost no BSV. When a plan is ready, the
wallet can publish that ciphertext as a 1Sat Ordinal. Each on-chain version
moves the same satoshi forward, giving the plan one permanent origin.

## Quick start

```sh
npx bitplan auth
bunx bitplan upload ./plan.html --hosted --link
```

The command prints a reader link. Open it in a browser without connecting a
wallet. Treat the complete link like a password: anyone who has it can read.

Publish the latest hosted version on chain when it is ready:

```sh
bunx bitplan inscribe ./plan.html
```

```sh
npx bitplan list
npx bitplan fetch <origin>
npx bitplan version
```

Install the BitPlan agent skill:

```sh
bunx bitplan skill install
```

This runs the Skills CLI to install the skill from `opldotdev/bitplan.dev`.
If the wrapper cannot run, use the Skills CLI directly:

```sh
npx skills add opldotdev/bitplan.dev --skill bitplan -g
```

## How it works

```mermaid
flowchart TD
    Plan[HTML plan] --> CLI[BitPlan CLI]
    CLI -->|Encrypt this plan| Wallet[BRC-100 wallet]
    Wallet --> Hosted[Encrypted hosted draft]
    Wallet -->|Sign and publish| Bitcoin[1Sat Ordinal]
    Hosted --> Site[bitplan.dev]
    Bitcoin --> OrdFS[OrdFS]
    OrdFS --> Site[bitplan.dev]
    Site --> WalletOrLink[Wallet or reader link]
    WalletOrLink -->|Decrypt in the browser| Plaintext[Plan]
```

The CLI validates the HTML, then your wallet encrypts it. BitPlan either keeps
the sealed envelope in hosted storage or loads it through OrdFS after an
on-chain publish. Decryption happens in the browser.

Versions keep the same origin:

```mermaid
flowchart TD
    V1[Version 1<br/>origin] --> V2[Version 2] --> V3[Latest]
```

## Share a plan

Add one or more wallet identity public keys when publishing:

```sh
npx bitplan upload ./plan.html \
  --share-with <identity-key>
```

The document is encrypted once. Its document key is wrapped separately for
the owner and each invited reader.

```mermaid
flowchart TD
    Document[One encrypted document] --> Key[Document key]
    Key --> Owner[Owner wallet]
    Key --> ReaderA[Reader A identity key]
    Key --> ReaderB[Reader B identity key]
```

## Documentation

- [How BitPlan works](https://bitplan.dev/docs/how-it-works)
- [CLI setup](https://bitplan.dev/docs/cli-setup)
- [Agents and wallets](https://bitplan.dev/docs/agents)
- [CLI commands](https://bitplan.dev/docs/commands)
- [Encrypted envelope](https://bitplan.dev/docs/envelope)

## Repository

| Path | Contents |
| --- | --- |
| [`apps/web`](apps/web) | Next.js website, plan viewer, docs, and sponsorships |
| [`packages/cli`](packages/cli) | Published `bitplan` command-line package |

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun test
bun run build
```

Compatibility tests open CLI-produced envelopes with the website
implementation. Wallet and network boundaries use mocks, so the automated
suite never publishes a transaction.

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) · Third-party notices are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
