# Hosted encrypted tier: investigation

Status: investigation only. Nothing here is built or decided.
Date: 2026-09-02

## The idea

Some people want BitPlan's encryption but do not want to hold BSV or publish
to a chain. Give them the same envelope, the same wallet keys, and the same
viewer, but let bitplan.dev store the ciphertext instead of Bitcoin. Charge
for it at roughly here.now prices.

## What already works in our favour

The envelope is a container, not a transport. Nothing in `packages/cli/src/envelope.ts`
or the viewer cares where the bytes came from:

- Encryption happens in the wallet before upload (`wallet.encrypt`, BRC-2).
  A hosted copy of the envelope is exactly as opaque to our server as it is
  to the chain today.
- Shared drafts wrap one document key per reader identity key. Reader
  management does not change.
- The viewer already fetches ciphertext from a gateway URL and hands it to
  the wallet. Swapping `https://api.1sat.app/...` for
  `https://bitplan.dev/api/h/<id>` is a URL change.
- Vercel Blob is already a dependency for sponsor images. Storage exists.
- `bitplan auth` already proves control of an identity key to the wallet.
  The same identity key can be the hosted account, with no email and no
  password.

So the encryption story survives intact. A wallet is still required, because
the keys live there. That is a feature. It is also the main friction, see
below.

## What changes

| Concern | On chain today | Hosted tier |
| --- | --- | --- |
| Identifier | Origin outpoint `txid_vout` | Server-issued id, e.g. `h_<nanoid>` |
| Versions | Reinscription chain, read from the indexer | Server list of envelope hashes, each signed by the publisher |
| Who can publish v2 | Whoever holds the coin | Whoever signs with the identity key that created the draft |
| Concurrency | Second spend fails | `If-Match` on the current version hash, 409 on conflict |
| Deletion | Impossible | Owner can delete, retention rules apply |
| Availability | Chain plus any ORDFS gateway | bitplan.dev only |
| Metadata leakage | Reader identity keys are public in the header on chain | Header is visible only to our server |
| Cost to publish | About 1 sat per KB | Plan fee |

Note the metadata row. A hosted draft leaks less than an on-chain draft,
because the reader list is not public. That is a real privacy argument for
the hosted tier, and it is worth saying out loud on the pricing page.

## Design sketch

### Auth

Every write is a BRC-100 signed request. The CLI asks the wallet for
`createSignature` over a canonical string of method, path, body hash, and a
server nonce with a short expiry. The server verifies against the identity
key in the header. No sessions, no cookies, no email. The identity key is the
account id. BRC-103 mutual auth is the more complete option if we want the
server to authenticate itself too, but signed requests are enough for v1.

### Storage

- Blob key: `envelopes/<sha256 of envelope bytes>`. Content-addressed, so a
  re-upload of identical bytes is free and idempotent.
- Draft record: `{ id, ownerIdentityKey, versions: [{ sha256, size, createdAt, signature }], createdAt, deletedAt }`.
- The signature is the publisher signing `sha256` with the identity key.
  The viewer verifies it, so our server cannot substitute a version without
  detection. This is stronger than any of the compared products offer.

Storage volume is tiny. Plans cap at 512 KB and most are far smaller. A
thousand users at ten drafts with ten versions each is under 50 GB worst
case. Blob cost is not the constraint.

### Viewer

`/h/<id>` route beside `/d/<origin>`. Same viewer component, different
fetcher. Show a badge that says "hosted by bitplan.dev, not on chain" so
the promise of the on-chain tier is never blurred.

### CLI

```
bitplan upload ./plan.html --hosted
bitplan upload ./plan.html            # same file again, new hosted version
bitplan inscribe h_abc123             # inscribe latest envelope, keep id as alias
```

`~/.bitplan/drafts.json` already maps file path to origin. Add hosted ids to
the same map with a `kind` field. `inscribe` reads the latest hosted envelope,
inscribes it exactly as `upload` does today, and records the origin. The
server keeps `h_abc123` as a redirect to `/d/<origin>`. Every plan can start
hosted and end up permanent. That is the migration story and it makes the
hosted tier an on-ramp to the chain rather than a replacement.

### Readers without a wallet

The hosted tier does not fix this on its own. Readers still decrypt with a
wallet. The follow-up already noted in the project memory, a link-fragment
key slot, is the fix for both tiers: add a slot type to `brc2-multi` where
the document key is wrapped with a key derived from a secret in the URL
fragment. The server never sees the fragment. That gives us a password-link
equivalent to here.now's, and it is the single feature that would move the
most people from "interesting" to "usable". It should ship before or with
the hosted tier, not after.

## Pricing

here.now for reference: Free with 10 GB and 500 sites, Hobby $4 a month,
Developer $20 a month. Their free tier is generous because static hosting is
cheap for them. Ours is cheaper still, so price on value, not storage.

Proposal, to be argued with:

| Tier | Price | Included |
| --- | --- | --- |
| Free | $0 | 5 hosted drafts, 10 versions each, 30-day retention on inactive drafts |
| Plus | $5 a month or the BSV equivalent | Unlimited drafts and versions, no expiry, inscribe on chain included |
| On chain | Network fee only | Unchanged |

Payment options:

- Card via Stripe. Simplest for the audience this tier is for.
- BSV to the same address pattern the sponsor slots already use, priced from
  the existing BSV/USD quote code. Paying in BSV for a tier whose point is
  not needing BSV is odd, but some users will have a wallet with a balance
  and no card handy.

Charging in fiat means a legal entity, terms of service, a privacy policy
that covers stored ciphertext, and a refund path. None of those exist today.
That is the largest hidden cost of this tier and it should be scoped before
any code.

## Risks and trade-offs

- Brand. The homepage says no content servers. A hosted tier is a content
  server. The framing that survives is "drafts start hosted, permanence is
  one command away". If we cannot say that honestly, the tier hurts more
  than it helps.
- Availability. bitplan.dev becomes a dependency for hosted drafts. Keep
  the on-chain tier independent of the server forever.
- Abuse. We store bytes we cannot read. We can still enforce size, rate,
  and account limits, and we can delete on a valid takedown, but we cannot
  moderate content. The terms need to say that.
- Retention. Free-tier expiry needs a warning path. The identity key has no
  email attached, so the warning has to be in the CLI and the drafts list.
- Wallet friction remains. A person with no wallet still cannot use the
  hosted tier. If the target user has no wallet at all, an embedded or
  browser wallet is a prerequisite, and that is a bigger project than this
  one.

## Recommendation

Worth doing, in this order:

1. Link-fragment reader slot. Removes the reader wallet requirement for
   both tiers and is the biggest gap against every product on the compare
   page.
2. Hosted storage with signed request auth, content-addressed blobs, signed
   version lists, and `inscribe`. Free tier only at first, no billing.
3. Billing, terms, and privacy policy, once there is demand from step 2.

Steps 1 and 2 are a few days each. Step 3 is mostly not engineering.

## Ideas worth borrowing from the compared products

- here.now: `baseVersionId` conflict detection. The chain gives us this for
  free. Say so in the docs and the CLI error message.
- here.now: an installable agent skill (`npx skills add ...`). We have
  `llms.txt`. A packaged skill is a small step and it is how here.now got
  adopted by agent frameworks.
- here.now: version history you can browse and restore. The viewer should
  list versions at an origin and open any of them.
- postplan: `--description` and `--new`. Correction: both already exist on
  `bitplan upload`. Nothing to do.
- ChatGPT Sites: private by default with an explicit widen-access step. We
  are already there. Their editor role is worth thinking about as a second
  coin holder, which is a sharing model the chain can express directly.
- Claude Artifacts: nothing to borrow on privacy. Their July 2026 indexing
  incident is the clearest argument for encrypting before publishing and
  belongs in our marketing.
