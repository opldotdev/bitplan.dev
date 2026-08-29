# Changelog

## 0.0.7

### Added

- `upload --relay` sends the wallet-returned Atomic BEEF through 1Sat after a
  successful publish. 1Sat attempts to capture it for ORDFS and relays the
  transaction to Arcade; relay failure never disguises a successful wallet
  publish.

## 0.0.6

### Added

- `bitplan version` prints the installed package version.
- `upload --share-with <identity-key>` grants named wallet identities read
  access by BRC-2-wrapping a shared document key for each reader.
- `upload --private` makes the newly published version wallet-only without
  pretending it can revoke access to older inscriptions.

### Changed

- Shared envelopes use v2: the SDK encrypts the payload once and the BRC-100
  wallet wraps its 32-byte key for the owner and each named reader. Reading a
  shared envelope requires BitPlan 0.0.6 or a current bitplan.dev viewer.
- The CLI preserves a draft's current reader list on later versions and records
  it in local metadata; recipient identity keys remain public in the envelope.

## 0.0.5

### Changed

- Version publishes spend the existing coin through the local createAction pipeline, with 1sat permission-module labels omitted, so BSV Desktop can sign a reinscribe.
- Content reads default to `https://api.1sat.app` (`GET /content/<origin>:<seq>`).
- `bitplan list --verbose` prints one labeled block per draft instead of widening the table.
- `bitplan list` recovers title, description, and version from the on-chain envelope when local `drafts.json` is missing or behind the wallet.

### Fixed

- `--version` and `--limit` reject junk instead of coercing it.
- A corrupt or invalid `drafts.json` is an error, not an empty list.
- Content-type matching accepts parameters (`application/x-bitplan; charset=binary`) and rejects prefix lookalikes.

## 0.0.4

### Breaking Changes

- Drafts encrypt with BRC-2 `wallet.encrypt` (`counterparty: "self"`), not a homemade AES-GCM wrap. Envelope v1 is this format. Ciphertext published by 0.0.3 will not open.

### Changed

- Version publishes go through `sendOrdinals.execute` so the new envelope lands on the same satoshi.
- `bitplan list` prints a compact table. `--verbose` uses one labeled block per draft so full hashes and timestamps remain readable. `--json` is unchanged.

## 0.0.3

### Fixed

- Node 25+ no longer prints `ExperimentalWarning` about `localStorage` on `npx bitplan`. The published bin is an unbundled wrapper that relaunches Node with `--no-experimental-webstorage` (or `--no-webstorage`) before `@bsv/sdk` loads. The CLI does not use Web Storage.

## 0.0.2

### Fixed

- `npx bitplan` and `bunx bitplan` with no arguments print usage. 0.0.1 loaded the bundle and exited because the bin gated on `import.meta.url === argv[1]`, which fails on the `.bin` symlink both tools install.

### Added

- `bitplan auth` / `bitplan auth login` connect to a BRC-100 wallet. `--wallet-url` is stored in `~/.bitplan/config.json`.
- Command descriptions match postplan (`upload`, `list`, `whoami`, plus `fetch`).
