# bitplan

Publish plan documents to Bitcoin as 1Sat Ordinals. Encrypted by default.

The CLI encrypts a self-contained HTML document and inscribes it on BSV. Upload
the same file again and bitplan reinscribes the same satoshi, so one origin
outpoint is the draft's identity and its version history.

## Requirements

A running BRC-100 wallet on this machine. bitplan holds no keys: encryption,
decryption, signing, and funding are calls into your wallet. [BSV
Desktop](https://desktop.bsvb.tech/) serves the JSON API on
`127.0.0.1:3321`, which is where bitplan looks by default.

If no wallet answers, the command fails and says so.

## CLI

Upload a draft:

```sh
npx bitplan upload ./plan.html
bunx bitplan upload ./plan.html
```

Attach an optional description (shown in `bitplan list` and the My drafts page).
Re-running with `--description` updates it; omitting it leaves the existing one
untouched:

```sh
npx bitplan upload ./plan.html --description "Q3 warehouse migration plan"
```

Confirm the wallet is there:

```sh
npx bitplan auth
npx bitplan whoami
```

List the drafts this wallet holds. The table shortens origins and outpoints;
`--verbose` prints them in full, with the raw timestamp:

```sh
npx bitplan list
npx bitplan list --verbose
```

Read one back (HTML to stdout, metadata to stderr with `--meta`):

```sh
npx bitplan fetch <origin> --meta > plan.html
npx bitplan fetch https://bitplan.dev/d/<origin>
npx bitplan fetch <origin> --version 2
```

The CLI stores optional config and file-to-origin mappings in `~/.bitplan`.

Pass `--wallet-url` to point at a different BRC-100 endpoint; `upload` and
`fetch` also accept `--ordfs-url`.

Every publish prints the draft's origin, its version, and a viewer URL:

```
Origin:   <txid>_0
Outpoint: <txid>_0
Version:  1
Viewer:   https://bitplan.dev/d/<txid>_0
```

## Flags

```
bitplan upload <file>
  --draft <origin>         Update a specific draft
  --new                    Always create a new draft
  --description <text>     Set a short description
  -y, --yes                Skip the confirmation prompt
  --allow-finding <id>     Waive one secret-scanner finding (repeatable)

bitplan list
  --json
  -v, --verbose            Full origins, outpoints, and timestamps
  --limit <n>

bitplan fetch <origin|url>
  --meta
  --version <n>
```

## How it works

- **Encryption.** A fresh 32-byte AES-256-GCM key per version, wrapped by your
  wallet under BRC-2 self-encryption. The wrapped key travels in the envelope
  header; the raw key is never written anywhere. See
  [ENVELOPE.md](./ENVELOPE.md) for the byte layout.
- **Versioning.** The first publish inscribes a 1-satoshi output. Later
  publishes spend that satoshi back to you carrying a new envelope. Only the
  wallet holding the coin can publish the next one.
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
npx bitplan upload plan.html --allow-finding home-path-macos-3f2a91c40b7d
```

The scan runs on the plaintext even though the output is encrypted.

## State

`~/.bitplan/` (directory `0700`, files `0600`):

- `config.json`: optional `walletUrl` and `ordfsUrl` overrides.
- `drafts.json`: which local file maps to which draft: origin, keyID, latest
  outpoint, latest version.

Neither file holds key material. Losing `drafts.json` costs convenience only:
origins are on chain, and each draft's keyID is in its envelope header.

## License

MIT.
