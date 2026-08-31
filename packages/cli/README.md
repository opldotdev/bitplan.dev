# bitplan

Publish plan documents to Bitcoin as 1Sat Ordinals. Encrypted by default.

The CLI validates a self-contained HTML document, encrypts it with standard
`@bsv/sdk` and BRC-100 wallet operations, then asks the wallet to inscribe it on
BSV. Upload the same file again and the wallet spends the current draft coin
with a new inscription, so one origin outpoint identifies the draft and its
version history.

## Requirements

A running BRC-100 wallet on this machine. bitplan never receives identity
private keys: BRC-2 wrapping, unwrapping, signing, and funding are wallet calls.
The shared document key exists transiently in the CLI. [BSV
Desktop](https://desktop.bsvb.tech/) serves the JSON API on
`127.0.0.1:3321`, which is where bitplan looks by default.

If no wallet answers, the command fails and says so.

## CLI

Upload a draft:

```sh
npx bitplan upload ./plan.html
bunx bitplan upload ./plan.html
```

By default, BitPlan notifies 1Sat after the wallet publishes so ORDFS can capture
the transaction as quickly as possible. Opt out when needed:

```sh
npx bitplan upload ./plan.html --no-relay
```

Normally, the wallet publishes first. Afterward, bitplan sends the
wallet-returned Atomic BEEF through 1Sat, which attempts to capture it for
ORDFS and forwards the transaction to Arcade. This may make the viewer
available sooner. A relay failure is only a warning because the wallet publish
may already have succeeded. `--no-relay` skips only this notification.

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
npx bitplan version
```

Share the next version with one or more wallet identity public keys. Existing
readers remain authorized unless you explicitly publish a private version:

```sh
npx bitplan upload ./plan.html --share-with <identity-key>
npx bitplan upload ./plan.html \
  --share-with <identity-key-a> \
  --share-with <identity-key-b>
npx bitplan upload ./plan.html --private
```

`bitplan whoami` prints the connected wallet's identity key. A shared version
stores the encrypted document once, then asks the wallet to wrap its 32-byte
document key for each reader. Identity keys and the access list are public, and
`--private` only affects the new version; older shared inscriptions remain
readable by their original recipients. Security level 2 lets the wallet ask for
permission for each new reader.

List the drafts this wallet holds. The default table shortens origins and
outpoints. `--verbose` switches to one labeled detail block per draft so full
identifiers and timestamps do not stretch the table:

```sh
npx bitplan list
npx bitplan list --verbose
```

Read one back (HTML to stdout, metadata to stderr with `--meta`). Metadata
includes the envelope version, access mode, and public reader list:

```sh
npx bitplan fetch <origin> --meta > plan.html
npx bitplan fetch https://bitplan.dev/d/<origin>
npx bitplan fetch <origin> --version 2
```

Agents and scripts can ask for one JSON value instead of parsing the text made
for people:

```sh
npx bitplan upload ./plan.html --yes --json
npx bitplan fetch <origin> --json
```

The upload result includes the origin, current outpoint, version, access list,
relay status, and viewer URL. `--json` still requires `--yes`; it never treats a
machine-readable response as permission to publish. Fetch JSON includes both
the decrypted HTML and its metadata, so `--meta` is not needed.

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
  --share-with <key>       Add a reader identity key (repeatable)
  --private                Make the new version wallet-only
  --no-relay               Skip the default 1Sat notification for ORDFS capture
  -y, --yes                Skip the confirmation prompt
  --json                   Print one JSON result (requires --yes)
  --allow-finding <id>     Waive one secret-scanner finding (repeatable)

bitplan list
  --json
  -v, --verbose            One detailed block per draft
  --limit <n>

bitplan fetch <origin|url>
  --meta
  --json                   Print the HTML and metadata as JSON
  --version <n>

bitplan version
```

In a non-interactive shell, `upload` requires `--yes`; otherwise it stops before
encryption or publishing rather than assuming consent.

## How it works

- **Encryption.** Private drafts use one BRC-2 `wallet.encrypt` call with
  `counterparty: self`. Shared drafts use the SDK's `SymmetricKey` to encrypt
  the document once, then BRC-2-wrap that key for the owner and each recipient.
  The CLI never handles identity private keys or implements its own cipher. See
  [ENVELOPE.md](./ENVELOPE.md) for the byte layout.
- **Versioning.** The first publish inscribes a 1-satoshi output. Later
  publishes spend that satoshi back to you carrying a new envelope. Only the
  wallet holding the coin can publish the next one.
- **Propagation.** By default, the CLI sends the wallet-returned Atomic BEEF to
  1Sat. 1Sat attempts to store it for ORDFS and forwards the leaf transaction to
  Arcade. The wallet remains the publisher. Pass `--no-relay` to opt out.
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

[MIT](./LICENSE). Bundled dependency notices are in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
