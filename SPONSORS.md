# Sponsorship operations

BitPlan has 30 fixed sponsor slots defined in source. There is no slot registry,
pre-mint transaction, Redis instance, or application database.

## Checkout

1. The browser crops the sponsor image and encodes a WebP no larger than
   200 KiB.
2. A standard BRC-100 wallet creates one signed `noSend` transaction containing
   the 1Sat inscription, MAP placement data, and the BitPlan payment.
3. The browser sends the Atomic BEEF to BitPlan without broadcasting it.
4. The server validates the image, MAP fields, link, fixed slot, and exact
   payment.
5. Vercel Blob records the winner at `sponsors/<slot>.beef` with overwrites
   disabled. The first valid upload wins.
6. BitPlan submits the winning BEEF to the 1Sat relay, which forwards it to ARC.

A transaction that loses the Blob race is never submitted by BitPlan. Stored
BEEF also lets the site display a sponsor immediately while OrdFS catches up.

## Wallets

The website uses one `@bsv/sdk` `WalletInterface` through
`WalletClient("auto")`. It supports standard BRC-100 transports, including the
Yours Wallet extension and BSV Desktop. It does not use the legacy
`window.yours` provider.

## On-chain format

Each winning transaction has exactly one 1-satoshi `image/webp` inscription and
one P2PKH payment to BitPlan. MAP records:

```json
{
  "app": "bitplan",
  "type": "ord",
  "subType": "bitplanSponsorSlot:<slot>",
  "name": "Sponsor name",
  "subTypeData": "{\"schema\":1,\"slot\":\"gold-1\",\"tier\":\"gold\",\"href\":\"https://example.com/\"}"
}
```

Prices are fixed in satoshis so old payments remain verifiable:

| Tier | Slots | Price |
| --- | ---: | ---: |
| Diamond | 4 | 30 BSV |
| Platinum | 6 | 15 BSV |
| Gold | 8 | 6 BSV |
| Silver | 12 | 3 BSV |

## Deployment

Connect one private Vercel Blob store to the web project. Vercel supplies
`BLOB_READ_WRITE_TOKEN`; it is a server secret and must never use a
`NEXT_PUBLIC_` prefix. No other sponsor-specific environment variable is
required.

The tests use generated transactions and a fake Blob implementation. They do
not broadcast or spend BSV.
