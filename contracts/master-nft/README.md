# master-nft

The Sonata master collection: NEP-171 tokens with NEP-178 approvals and a
fixed 5% NEP-199 creator royalty.

Each token is a song. Minting creates a keyless `<token_id>.<collection_id>`
sub-account, installs the immutable global `song-wallet` code, initializes it
with the collection, token id and payment token, and registers it with the
platform for payouts. The token itself never custodies money; transferring it
moves the right to the song wallet's balance.

See the workspace [README](../README.md) for build, test and deploy commands
and the full interface list.

## Mint rules

- `token_id` is a slug: 3-40 chars of `a-z`, `0-9`, `-`; no leading or
  trailing `-`; not one of `platform`, `market`, `usdc`, `oracle`, `masters`,
  `admin`.
- Token ids are unique.
- The attached deposit must cover `mint_deposit`. v1 keeps the deposit.

## Royalties

`nft_payout` and `nft_transfer_payout` split a sale price: 500 bps to
`creator_id`, the rest to the current owner. If the creator is the owner the
result is a single full-balance entry.
