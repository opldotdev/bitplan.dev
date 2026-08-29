# Sponsorship operations

Sponsor state lives on Bitcoin, not in a database. Each slot is a unique
ordinal listed through OrdLock. Buying the listing atomically pays BitPlan and
transfers that slot to the buyer. The buyer then reinscribes the slot with an
optimized WebP logo and MAP metadata that tells the site where to display it.

## Create a slot

With the BitPlan BRC-100 wallet running, create and list one slot:

```sh
bun sponsor:setup --slot gold-1 --yes
```

The current BSV/USD rate sets the tier price. Pass `--price-sats 1234` to use an
exact price. Each command creates the placeholder inscription already locked by
OrdLock, so setup is one wallet action and one transaction per slot.

Add the printed origin to `NEXT_PUBLIC_SPONSOR_SLOT_ORIGINS` as a JSON object:

```dotenv
NEXT_PUBLIC_SPONSOR_SLOT_ORIGINS={"gold-1":"<txid>_0"}
```

MAP selects the visible tier and slot. The origin allowlist is still required:
without it, anyone could publish matching MAP fields and impersonate a sponsor.

## Buyer flow

The website connects to the buyer's BRC-100 wallet. It crops the selected image
to the tier canvas and encodes WebP before any wallet request. The OrdLock
purchase is the reservation and payment in one transaction; a second wallet
transaction reinscribes the purchased slot with the logo. If that second step
fails, the buyer still owns the slot and can retry without paying again.

Tier canvases are 828×256 (Diamond), 640×192 (Platinum), 512×192 (Gold), and
384×128 (Silver). Logo bytes and the sponsor name, URL, tier, and slot are
permanent. The buyer must confirm they have publication rights.
