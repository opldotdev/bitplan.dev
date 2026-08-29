# Envelopes

This is the encrypted on-chain format BitPlan publishes. Anything that can
read a 1Sat Ordinal and talk to a BRC-100 wallet can implement it. There is no
cleartext document mode.

## Where it lives

A draft is a versioned 1Sat Ordinal:

- Content type: `application/x-bitplan`.
- Content: the envelope below.
- Cleartext MAP: `{ "app": "bitplan", "type": "plan", "enc": "1" }`.

The first inscription's outpoint is the stable origin. Each update spends the
current 1-sat output and puts the next envelope on its replacement. Holding the
coin authorizes publishing; holding an encryption relationship authorizes
reading. Those are separate capabilities.

## Binary frame

The envelope is a container, not an encryption algorithm. Its framing and JSON
header are public. Encryption protects the document in the body.

All multi-byte integers are little-endian.

```text
+--------+---------+-------------------+------------------+-----------------+
| 'BPLN' | version | uint32-LE         | header           | ciphertext body |
| 4 B    | 1 B     | 4 B: header bytes | UTF-8 JSON       | to end          |
+--------+---------+-------------------+------------------+-----------------+
```

The version byte is `0x01` for a private envelope and `0x02` for a shared
envelope. Readers reject unknown versions, bad magic, invalid headers, buffer
overruns, headers larger than 64 KiB, and empty ciphertext.
`brc2-self` and `brc2-multi` are BitPlan wire labels; `brc2-multi`
describes BitPlan's shared layout.

## Private

Private drafts use this compact format:

```json
{
  "v": 1,
  "key": {
    "mode": "brc2-self",
    "protocolID": [2, "bitplan"],
    "keyID": "<per-draft UUID>"
  }
}
```

The body is one complete result from:

```ts
wallet.encrypt({
  protocolID: header.key.protocolID,
  keyID: header.key.keyID,
  counterparty: "self",
  plaintext
})
```

The same wallet decrypts it with `counterparty: "self"`.

## Shared

Shared drafts encrypt the document once with the SDK's `SymmetricKey`. The
wallet then encrypts only that 32-byte document key for each reader. The first
slot is the publisher's self-encrypted key; each remaining slot is a key wrap
for one recipient identity public key.

```json
{
  "v": 2,
  "key": {
    "mode": "brc2-multi",
    "protocolID": [2, "bitplan"],
    "keyID": "<per-draft UUID>",
    "payloadLength": 1282,
    "senderIdentityKey": "<compressed public key>",
    "slots": [
      { "identityKey": "<sender>", "offset": 1282, "length": 80 },
      { "identityKey": "<recipient>", "offset": 1362, "length": 80 }
    ]
  }
}
```

The body starts with `payloadLength` bytes of AES-256-GCM ciphertext produced by
`SymmetricKey.encrypt`. Wrapped-key slots follow in header order. Slot offsets
are absolute body offsets, contiguous, and cover the rest of the body.
`SymmetricKey` gets the 32-byte document key and a fresh 32-byte IV from the
operating system CSPRNG. It throws instead of falling back to insecure
randomness.

Before encrypting, the publisher hashes the canonical header with SHA-256 and
stores the hex digest as `headerSha256` inside the encrypted plaintext. Object
keys are sorted lexicographically at every level; array order is preserved.
Readers recompute the hash and reject a mismatch. This binds the reader list,
publisher identity, key parameters, and body layout to the encrypted payload.

For the owner and each recipient, the publisher calls:

```ts
wallet.encrypt({
  protocolID: header.key.protocolID,
  keyID: header.key.keyID,
  counterparty: recipientIdentityKey,
  plaintext: documentKeyBytes
})
```

The recipient selects its slot and calls `wallet.decrypt` with the publisher's
`senderIdentityKey` as `counterparty`. The publisher uses `counterparty:
"self"`. The returned 32-byte key decrypts the single payload with SDK
`SymmetricKey.decrypt`.

BitPlan uses SDK AES-GCM for the payload and BRC-100 wallet encryption for the
small document key. It never receives an identity private key or implements
cryptography itself. `keyID` is a public wallet derivation label, not key
material. The identity key names the counterparty; it is not the document key.

## Plaintext

The private body or shared payload decrypts to this UTF-8 JSON:

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
    "fileSha256": "hex SHA-256",
    "createdAt": "ISO 8601 string"
  },
  "html": "<the document>"
}
```

Shared plaintext also has a top-level `headerSha256` field. It is checked and
removed before the document is returned to the CLI or viewer.

## Privacy and permanence

With private plans, only the envelope parameters and ciphertext are public.
Shared plans also publish the reader identity keys so each reader can
locate its slot. This reveals the access graph, and size and inscription cost
grow only by one small wrapped key and header entry per reader. BitPlan caps a
shared version at 128 additional readers.

Publishing a later private version does not revoke access to an older shared
version. No inscription can be edited or deleted. BitPlan therefore scans the
plaintext for credentials before asking the wallet to encrypt it.

The envelope does not prove who published it. Publishing authority comes from
the ordinal origin and transaction chain.
