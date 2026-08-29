# BitPlan

BitPlan publishes encrypted, versioned HTML plans as 1Sat Ordinals on BSV.
Encryption, identity keys, signing, and funding stay in the user's BRC-100
wallet. [bitplan.dev](https://bitplan.dev) is a client-side viewer, not a
plaintext document host.

> [!WARNING]
> Publishing is permanent. Ciphertext, public metadata, recipient identity
> keys, and transaction history cannot be deleted. Never publish credentials
> or personal data, even when encrypted.

## How it works

1. The CLI validates a self-contained HTML document and scans it for secrets.
2. A private draft is encrypted by the wallet. A shared draft is encrypted once
   with `@bsv/sdk`, and the wallet wraps its document key for each reader.
3. The BRC-100 wallet signs and broadcasts the inscription transaction.
4. Later versions spend the same 1-satoshi output forward, keeping the genesis
   outpoint as the stable draft ID.
5. The website or CLI fetches ciphertext through OrdFS and asks an authorized
   wallet to decrypt it locally.

The optional `--relay` upload flag sends the wallet-returned Atomic BEEF to
1Sat's relay path, which may make the new version available through OrdFS
sooner. The wallet remains the publisher.

## Quick start

Requirements:

- Node.js 22.12 or newer for the published CLI
- A running [BSV Desktop](https://desktop.bsvb.tech/) or compatible BRC-100
  wallet
- A small amount of BSV for inscription fees

```sh
npx bitplan auth
npx bitplan whoami
npx bitplan upload ./plan.html --relay
```

Use `npx bitplan --help` for the full command list. CLI behavior and the
encrypted envelope format are documented in
[packages/cli/README.md](packages/cli/README.md) and
[packages/cli/ENVELOPE.md](packages/cli/ENVELOPE.md).

## Monorepo

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js viewer and documentation site |
| `packages/cli` | Published `bitplan` npm CLI |

The website and CLI intentionally share the envelope contract but perform
decryption in their own runtime. Compatibility tests verify that envelopes
produced by the CLI open in the website implementation.

## Development

The repository uses Bun 1.3.14 and a committed lockfile.

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun test
bun run build
```

The test suite uses mock wallets and does not publish transactions. A real
end-to-end test is irreversible and must only be run deliberately with a
disposable document and explicit wallet approval.

For website-specific guidance, see [apps/web/README.md](apps/web/README.md).
The files under `apps/web/src/components/ui` are stock shadcn components;
product UI should compose them rather than replacing them with custom copies.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report
security issues privately according to [SECURITY.md](SECURITY.md), especially
issues involving wallet permissions, encryption, secret scanning, or sandboxed
HTML rendering.

Third-party attribution is recorded in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Sponsor checkout and operations are documented in [SPONSORS.md](SPONSORS.md).

## License

[MIT](LICENSE)
