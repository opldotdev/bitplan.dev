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

One transaction may contain multiple BitPlan ordinal outputs. Each output
contains its own independently sealed envelope with the same `BPLN` framing,
wire version `0x02`, cipher, and reader-key wrapping. Output count does not
change the envelope format or require a reader migration. Seal each payload
normally with its stream's key ID and intended recipients; do not reuse a
payload encryption key between outputs.

The publishing wrapper accepts already-sealed bytes and returns an origin and
outpoint for each output. Existing ordinal inputs and replacement outputs stay
in matching order, followed by any new ordinals. A document-to-annotation
relationship belongs in encrypted application content, not the envelope
header. A same-transaction relationship must use an agreed output reference,
not embed the transaction's own ID before signing. The native annotation
schema and its viewer integration remain separate work.

### Annotation recovery contract (library implementation; viewer integration pending)

The web library now validates `bitplan-annotation-checkpoint/1` participant
snapshots, seals them independently with the existing v2 envelope, and replays
supplied checkpoint heads. Embedded image bytes stay inside that encrypted
payload. Same-transaction references use an output index; optional source
metadata retains the hosted version reviewed. The ordinary document decoder
still requires HTML and does not mistake a checkpoint for a replacement plan.

Replay reports missing references and forks. Its input locations are unverified
until a caller checks actual transaction lineage and content hashes; it does not
fetch transactions, discover unknown streams, or verify participant signatures.
Native checkpoint publishing, a durable transaction journal, chain recovery UI,
and verified handles remain unfinished. No viewer action invokes these new
publishing primitives yet.

An annotation payload must bind the document's stable origin, exact version
outpoint, and SHA-256 of its original UTF-8 HTML. In a combined transaction,
use a same-transaction output index plus that hash, then resolve and verify
the outpoint from the signed transaction. Each output needs its own recipient
slots, including any intended reader-link identity. Neither batch publishing
nor these application references require changing the envelope.

Checkpoints need previous stream references and exact known heads to replay
their published view without the hosted database. All required content must
be embedded or available through immutable references with hashes. Replay
must expose missing records, validate receipts, and distinguish causal order
from client timestamps.

Known-head manifests do not discover unknown new streams. Complete discovery
requires a separately verified index and a stated coverage boundary; arbitrary
MAP fields are not automatically indexed. A public grouping tag would expose
transaction correlation and requires an explicit privacy decision. The current
MAP above contains no such tag.

An application parent reference is not ordinal ownership or author approval.
Profile labels are attribution claims unless independently signed. A receipt
must match the actual transaction outputs; broadcast acceptance alone is not
mining confirmation. Failed hosted registration must retry that receipt,
not create a second inscription.

## Binary frame

The bitplan envelope is a container, not an encryption algorithm. Its framing
and JSON header are public. Encryption protects the document in the body.

All multi-byte integers are little-endian.

```text
+--------+------+-------------------+------------------+-------------------+---------------+
| 'BPLN' | 0x02 | uint32-LE         | header           | payload           | wrapped keys  |
| 4 B    | 1 B  | 4 B: header bytes | UTF-8 JSON       | ciphertext        | to end        |
+--------+------+-------------------+------------------+-------------------+---------------+
```

The wire version byte is `0x02`. Readers reject unknown versions, bad magic,
invalid headers, buffer overruns, headers larger than 64 KiB, and empty
ciphertext. `brc2-multi` is the BitPlan wire label for this layout.

## Header

The document is encrypted once with the SDK's `SymmetricKey`. The wallet then
encrypts only that 32-byte document key for each reader. The first slot is the
publisher's self-encrypted key; each remaining slot is a key wrap for one
recipient identity public key. A plan with no invited readers has one slot, the
publisher's.

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
It detects changes made without the document key; it is not a publisher
signature.

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

The payload decrypts to this UTF-8 JSON:

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

Plaintext also has a top-level `headerSha256` field. It is checked and
removed before the document is returned to the CLI or viewer.

## Privacy and permanence

Envelope parameters, ciphertext, the publisher identity, and reader identity
keys are public so each reader can locate its slot. This reveals the access
graph, and size and inscription cost grow only by one small wrapped key and
header entry per reader. BitPlan caps a version at 128 additional readers.

Publishing a later wallet-only version does not revoke access to an older
version that included other readers. No inscription can be edited or deleted.
BitPlan therefore scans the plaintext for credentials before asking the wallet
to encrypt it.

The envelope does not prove who published it. Publishing authority comes from
the ordinal origin and transaction chain.
