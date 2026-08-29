# The bitplan envelope, version 1

This is the on-chain format bitplan publishes. It is a public specification:
anything that can read a 1Sat Ordinal and talk to a BRC-100 wallet can
implement it. The reference implementation is `packages/cli` in this
repository.

bitplan v1 is **encrypted-only**. There is no cleartext code path, and a
conforming implementation must not add one.

## Where it lives

A bitplan draft is a 1Sat Ordinal.

- **Content type:** `application/x-bitplan` — constant for every version of
  every draft. The type describes the envelope, not the payload.
- **Inscription content:** the envelope bytes described below.
- **MAP metadata (cleartext, on chain):**

  ```json
  { "app": "bitplan", "type": "plan", "enc": "1" }
  ```

  Nothing else. Titles, descriptions, repository names and commit subjects are
  metadata about a private document, so they live inside the ciphertext.

## Versioning is reinscription

The first publish inscribes a fresh 1-satoshi output. Every later publish
spends that same satoshi back to its owner with a new envelope on the output.
The coin — and therefore the origin chain — carries forward, so:

- the **origin** (the genesis outpoint, `txid_vout`) is the stable identity of
  a draft, for its whole life;
- each spend of the coin is one **version**; ORDFS sequence 0 is version 1;
- only the wallet holding the coin can publish the next version.

Per BRC-147, a reinscribed output keeps the **genesis** `origin:` and `type:`
tags as the collectable's identity — it is not retagged with the new content
type. Because bitplan's content type never varies, `type:application/x-bitplan`
is a reliable filter for every version of every bitplan draft in a wallet.

## Binary layout

All multi-byte integers are little-endian.

```
+--------+---------+-------------------+------------------+---------------+
| 'BPLN' | 0x01    | uint32-LE         | header           | ciphertext    |
| 4 B    | 1 B     | 4 B: header bytes | UTF-8 JSON       | to end        |
+--------+---------+-------------------+------------------+---------------+
```

| Field       | Size    | Value                                              |
| ----------- | ------- | -------------------------------------------------- |
| magic       | 4 bytes | ASCII `BPLN` (`0x42 0x50 0x4C 0x4E`)                |
| version     | 1 byte  | `0x01`                                              |
| header size | 4 bytes | uint32-LE byte length of the header JSON            |
| header      | varies  | UTF-8 JSON, exactly `header size` bytes             |
| ciphertext  | rest    | AES-256-GCM output, authentication tag appended     |

A reader must reject anything whose magic is not `BPLN`, whose version byte it
does not implement, whose header size overruns the buffer, or that carries no
ciphertext.

## Header

```json
{
  "v": 1,
  "alg": "aes-256-gcm",
  "iv": "<base64, 12 bytes>",
  "key": {
    "mode": "brc2-self",
    "protocolID": [2, "bitplan"],
    "keyID": "<uuid string>",
    "ciphertext": "<base64 of the wallet.encrypt output>"
  }
}
```

| Field            | Meaning                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `v`              | Header version. `1`.                                                 |
| `alg`            | Content cipher. `aes-256-gcm`.                                       |
| `iv`             | 12-byte AES-GCM initialization vector, base64. Fresh per version.    |
| `key.mode`       | How the content key is wrapped. `brc2-self` is the only v1 mode.     |
| `key.protocolID` | BRC-2 protocol: `[securityLevel, name]`. bitplan uses `[2, "bitplan"]`. |
| `key.keyID`      | BRC-2 key id. Minted per draft, **reused for every version**.        |
| `key.ciphertext` | The wrapped content key, base64 of the wallet's `encrypt` output.    |

The header is cleartext on purpose. It carries no secret: `keyID` is a label
the wallet derives against, not a key, and it is what lets a client recover a
draft's wrapping parameters from the chain alone when local state is gone.

A reader must use the **header's** `protocolID` and `keyID` when unwrapping,
not its own constants, so that an envelope written under a different protocol
still opens if the wallet holds the key.

## Content key

- 32 random bytes from a CSPRNG (`crypto.getRandomValues`).
- Fresh for **every version**. Never derived from the document, never reused
  across versions, never written to disk.
- Used once for AES-256-GCM, then wrapped:

  ```
  wallet.encrypt({
    protocolID: [2, "bitplan"],
    keyID:      <the draft's keyID>,
    counterparty: "self",
    plaintext:  <the 32 key bytes>
  })
  ```

- Unwrapping reverses it with `wallet.decrypt` and the header's
  `protocolID` / `keyID`.

The publishing client holds no keys of its own. Every key operation is a
BRC-100 call into the user's wallet.

## Ciphertext

AES-256-GCM over the UTF-8 JSON plaintext below, with the WebCrypto default
128-bit authentication tag appended to the ciphertext. No additional
authenticated data.

## Plaintext

```json
{
  "meta": {
    "title": "string | null",
    "description": "string | null",
    "repoOrg": "string | null",
    "repoName": "string | null",
    "repoHost": "string | null",
    "gitBranch": "string | null",
    "gitCommitSha": "string | null",
    "gitCommitSubject": "string | null",
    "gitDirty": "boolean | null",
    "cliVersion": "string",
    "fileSha256": "string",
    "createdAt": "ISO 8601 string"
  },
  "html": "<the document>"
}
```

`fileSha256` is the SHA-256 of the HTML document as UTF-8, hex encoded.
`gitDirty` is `null` outside a git repository, and `true`/`false` inside one.

## What is public

Everything on chain is public forever, including the ciphertext. Encryption
protects the contents against readers **today**; it does not make an
inscription private against a future break of AES-256-GCM or of the wallet's
key derivation, and nothing published can be edited or deleted.

That is why a conforming publisher should scan the **plaintext** for
credentials before sealing it, and why the on-chain MAP metadata is kept to
three fields.

## Reserved for later versions

- Version byte `0x02` and above, and `key.mode` values other than
  `brc2-self`, are reserved. A v1 reader must reject them rather than guess.
- `TransferItem.signWithBAP` (Sigma-signed envelopes) exists upstream but is
  **not** used by bitplan v1.
