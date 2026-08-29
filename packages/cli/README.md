# bitplan

Publish plan documents to Bitcoin as 1Sat Ordinals. Encrypted by default.

`bitplan` takes a self-contained HTML document — the sort of plan, recap or
design page an agent writes for a human to read — encrypts it, and inscribes it
on BSV. Publishing again reinscribes the same satoshi, so a draft has one
stable identity and a version history anyone can walk.

## Requirements

A running BRC-100 wallet on this machine. bitplan holds **no keys**: every key
operation — encryption, decryption, signing, funding — is a call into your
wallet. [BSV Desktop](https://github.com/bitcoin-sv/desktop) serves the BRC-100
JSON API on `127.0.0.1:3321`, which is where bitplan looks by default.

If no wallet answers, every command fails and says so. There is no embedded
wallet and no fallback.

## Install

```sh
npm install -g bitplan
```

## Use

```sh
# Is the wallet there, and who am I?
bitplan whoami

# Publish a document. Prompts before spending anything.
bitplan upload plan.html --description "migration, phase one"

# Publish a new version of the same file — bitplan remembers which draft it is.
bitplan upload plan.html

# Publish a new version of a draft this machine has never seen.
bitplan upload plan.html --draft <origin>

# Start a separate draft from a file that already has history.
bitplan upload plan.html --new

# What has this wallet published?
bitplan list

# Read one back (HTML to stdout, metadata to stderr).
bitplan fetch <origin> --meta > plan.html
bitplan fetch https://bitplan.dev/d/<origin>
bitplan fetch <origin> --version 2
```

Every publish prints the draft's origin, its version, and a viewer URL:

```
Origin:   <txid>_0
Outpoint: <txid>_0
Version:  1
Viewer:   https://bitplan.dev/d/<txid>_0
```

## How it works

- **Encryption.** A fresh 32-byte AES-256-GCM key per version, wrapped by your
  wallet under BRC-2 self-encryption. The wrapped key travels in the envelope
  header; the raw key is never written anywhere. See
  [ENVELOPE.md](./ENVELOPE.md) for the byte layout — it is a public spec.
- **Versioning.** The first publish inscribes a 1-satoshi output. Later
  publishes spend that satoshi back to you carrying a new envelope, so the
  origin outpoint identifies the draft for its whole life and each spend is a
  version. Only the wallet holding the coin can publish the next one.
- **Metadata.** The cleartext MAP on chain is three fields:
  `{ app: "bitplan", type: "plan", enc: "1" }`. Titles, descriptions and git
  provenance live inside the ciphertext.

## Before it publishes

`bitplan upload` refuses to spend until the document passes two gates.

**HTML policy** (ported from [postplan](https://www.npmjs.com/package/postplan),
MIT): no `<form>`, `<iframe>`, `<object>`, `<embed>`, `<applet>`, `<base>` or
`<link>`; no external script sources; no inline event handlers; no `srcdoc`; no
`javascript:` / `vbscript:` / `file:` URLs; no meta refresh; 512 KB cap.

**Secret scanner:** private key blocks, cloud and SaaS token shapes, JWTs,
database URLs carrying credentials, long secrets behind `key=` / `token=` /
`secret=`, and absolute home paths. Findings block the upload. Waive one at a
time with the id the scanner prints:

```sh
bitplan upload plan.html --allow-finding home-path-macos-3f2a91c40b7d
```

The scan runs on the plaintext even though the output is encrypted. The
ciphertext is public forever, so a secret sealed today is a secret leaked the
day the cipher breaks — and an inscription cannot be recalled.

## State

`~/.bitplan/` (directory `0700`, files `0600`):

- `config.json` — optional `walletUrl` and `ordfsUrl` overrides.
- `drafts.json` — which local file maps to which draft: origin, keyID, latest
  outpoint, latest version.

Neither file holds key material. Losing `drafts.json` costs convenience only:
origins are on chain, and each draft's keyID is in its envelope header.

## Flags

Every command accepts `--wallet-url <url>` to point at a different BRC-100
endpoint; `upload` and `fetch` also accept `--ordfs-url <url>`.

## License

MIT.
