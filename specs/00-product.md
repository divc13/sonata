# 00 - Product

## One line

Every song is a self-custodial account: one subscription, a fixed rate per verified listening hour,
and a master you can sell with its wallet.

## The problem

Streaming pays artists a fraction of a cent per stream, pooled and opaque. Artists cannot see what a
listener is worth, cannot sell a recording with its income history, and cannot hold the asset that
actually earns. Listeners rent access forever and own nothing. The money layer is hidden behind
labels and collection societies.

## The product

Sonata is a subscription player for independent masters.

- **Listeners** buy a platform-wide 30-day pass for $5. It unlocks every song. No per-song purchase,
  no ads, no tiers in v1. A 30-second preview is free.
- **Artists** publish a master. Publishing mints a 1-of-1 NFT and creates a keyless NEAR sub-account
  for the song. The master is the asset. The song account is its bank.
- **Earnings** accrue per verified listening hour at a pre-decided constant `R = $0.03`. The platform
  settles each epoch and transfers USDC directly into each song's account.
- **Ownership** is the NFT. The owner of the NFT is the only account that can withdraw from the song
  account. Sell the NFT and the account, its balance, and its future income go with it.
- **Secondary sales** are fixed-price listings. The creator receives a 5% royalty. The seller
  receives the rest.

## Why this is not another NFT music marketplace

Most NFT music projects sell access tokens or fractional royalty shares. Sonata sells the master as
an operating asset. The novel part is the pairing:

1. The master owns a real account with no keys.
2. The account earns from a platform-wide subscription, not from per-song sales.
3. The account's balance moves with the master, so a buyer acquires a cash-flowing asset and the
   seller cannot keep the income after transfer.

The unit economics are legible. A listener pays $5 for 30 days. At 4 verified hours per day, that is
120 hours per month, or $0.042 per hour of subscription revenue against a $0.03 payout. The platform
keeps the margin and holds a reserve so the rate does not wobble.

## Users

| User          | Goal                                             | Success feels like                               |
| ------------- | ------------------------------------------------ | ------------------------------------------------ |
| **Listener**  | Hear great music, know the money reaches artists | One tap to buy a pass, then play anything        |
| **Artist**    | Publish a master, see earnings, get paid         | Upload, publish, watch the number grow, withdraw |
| **Collector** | Buy a master with real income                    | See trailing earnings, buy, receive the wallet   |
| **Operator**  | Keep the rate honest and the books balanced      | One screen with hours, rate, payouts, reserve    |

## Product model

### Master

- 1-of-1 NFT per song master. One master per recording. No editions, no fractions.
- Token id is a slug, for example `midnight-drive`.
- The NFT owns the song account `<slug>.masters-sonata.testnet`.
- Metadata: title, artist, description, cover, audio hash, duration, genre, release date.
- The creator is recorded at mint and receives the secondary royalty forever.

### Pass

- Platform-wide, non-transferable NFT.
- $5 for 30 days, paid in mock USDC on testnet.
- Unlocks all masters while active.
- Renewal extends from the later of now and the current expiry.
- The platform is the merchant of record. Pass revenue funds artist payouts.

### Earnings

- Verified listening hours only. The cap is 4 hours per listener per day.
- One global rate `R = $0.03` per verified hour.
- Paid in USDC directly to song accounts at epoch close.
- The platform keeps the remainder after payouts.
- Reserve target is 3 months of payouts. If the reserve falls below 1 month, the effective rate is
  pro-rata for that epoch. See `03-accounting.md`.

### Resale

- Fixed-price listing. No auctions in v1.
- 5% royalty to the creator. The rest to the seller.
- The buyer receives the NFT, the song account, and its balance.
- The seller cannot withdraw after transfer. The song account checks current ownership.

## Non-goals for v1

- Fractional shares, royalty splits, or collaborator payouts.
- Per-song subscriptions or pay-per-stream.
- Fiat on-ramp or credit cards. Testnet USDC only.
- Auctions, offers, or bidding.
- Mobile apps.
- Social features beyond the existing profile and playlists.
- Real-world rights registration, ISRC, or legal distribution.
- Multi-chain. NEAR testnet only.
- Podcasts, radio, shows, or an AI assistant. These are removed from the infinitunes shell.

## Success metrics for the demo

- A listener buys a pass in under 15 seconds.
- A song plays immediately after purchase.
- An artist sees a non-zero balance in the song account after one epoch.
- A collector buys a master and immediately sees the balance in the new owner's account.
- The previous owner's withdrawal fails with a clear error.
- The audit screen shows the epoch's total hours, effective rate, payouts, and listen root.

## Demo parameters (locked)

| Parameter           | Value                                        |
| ------------------- | -------------------------------------------- |
| Pass price          | $5.00                                        |
| Pass duration       | 30 days                                      |
| Rate R              | $0.03 per verified hour                      |
| Daily cap           | 4 hours per listener                         |
| Week cap            | 28 hours per listener (implied)              |
| Reserve target      | 3 months of trailing payouts                 |
| Pro-rata trigger    | reserve below 1 month                        |
| Rate changes        | none in v1 (immutable)                       |
| Secondary royalty   | 500 bps (5%)                                 |
| Settlement          | weekly in production, manual trigger in demo |
| Settlement currency | mock USDC, 6 decimals                        |
| Network             | NEAR testnet                                 |

## Naming

- Product: **Sonata**.
- Repo: `divc13/sonata`.
- Contracts: `masters-sonata.testnet`, `platform-sonata.testnet`, `market-sonata.testnet`,
  `usdc-sonata.testnet`, `oracle-sonata.testnet`.
- Song accounts: `<slug>.masters-sonata.testnet`.
- In user-facing copy, say **master**, **pass**, **earnings**, **owner**. Use **NFT**, **wallet**,
  **contract**, and **account** only in details drawers and the audit screen.

## Pitch

> Streaming hides the money. Sonata makes every master an account that earns. One $5 pass unlocks
> the catalog. Each verified listening hour pays the song $0.03, straight into an account that the
> master owns. Sell the master and the account goes with it. The artist keeps a 5% royalty, the
> listener gets the catalog, and the platform holds a reserve so the rate stays honest.

## Open questions

None. All product decisions for the demo are locked in `decisions.md`. Add new questions there under
"Open" and do not ship an answer in code until it is resolved.
