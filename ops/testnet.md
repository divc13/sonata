# Sonata testnet deployment

Status: accounts created 2026-11-07. Contracts not yet deployed.

## Identifiers

| Role                  | Account                    | Balance    |
| --------------------- | -------------------------- | ---------- |
| Parent / faucet       | `sonata.testnet`           | ~2.98 NEAR |
| Mock USDC (NEP-141)   | `usdc-sonata.testnet`      | 10 NEAR    |
| Master NFT collection | `masters-sonata.testnet`   | 10 NEAR    |
| Platform / settlement | `platform-sonata.testnet`  | 10 NEAR    |
| Market                | `market-sonata.testnet`    | 10 NEAR    |
| Listen oracle         | `oracle-sonata.testnet`    | 10 NEAR    |
| Artist Nadia          | `nadia-sonata.testnet`     | 10 NEAR    |
| Artist Kofi           | `kofi-sonata.testnet`      | 10 NEAR    |
| Artist Lena           | `lena-sonata.testnet`      | 10 NEAR    |
| Listener              | `listener.sonata.testnet`  | 1 NEAR     |
| Collector             | `collector.sonata.testnet` | 1 NEAR     |
| Spare artist account  | `nadia.sonata.testnet`     | 5 NEAR     |

Keys live locally in `~/.near-credentials/accounts.json`. Never commit that file or a copy of it.

Song accounts are created by the master contract as sub-accounts of the collection:
`midnight-drive.masters-sonata.testnet`, `paper-moons.masters-sonata.testnet`, and so on.

The spec's example names (`masters.sonata.testnet`, `nadia.testnet`) were placeholders. These hyphenated accounts are the deployed testnet names. Use `ops/testnet.env` as the source of truth in scripts.

## Deploy order

1. Build all wasm:
   `cargo build --workspace --target wasm32-unknown-unknown --release`
2. Deploy mock USDC to `usdc-sonata.testnet`.
3. Deploy song-wallet as a global contract and record the code hash.
4. Deploy platform to `platform-sonata.testnet` with:
   - USDC account
   - masters account
   - oracle account
   - platform fee recipient (use `sonata.testnet` for the demo treasury)
5. Deploy master-nft to `masters-sonata.testnet` with:
   - platform account
   - USDC account
   - song-wallet global code hash
   - mint deposit (start at 0.2 NEAR)
6. Deploy market to `market-sonata.testnet` with masters, USDC, platform, and fee recipient.
7. Wire owner-only setters so platform and market know each other, and master knows platform.
8. Mint the 12 demo masters from the artist accounts.
9. Register listener/collector on USDC and send them mock USDC.
10. Register platform and market on USDC (storage deposit) and fund their NEAR balances for cross-contract calls.

## Contract IDs for the web app

```bash
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_MASTERS_CONTRACT=masters-sonata.testnet
NEXT_PUBLIC_PLATFORM_CONTRACT=platform-sonata.testnet
NEXT_PUBLIC_MARKET_CONTRACT=market-sonata.testnet
NEXT_PUBLIC_USDC_CONTRACT=usdc-sonata.testnet
```

## Notes

- USDC is a demo token with 6 decimals. All accounting is in micro-USDC.
- The song account is keyless. Its only withdraw path checks the master NFT owner.
- Platform and market must register themselves on USDC in their constructors.
- `platform.register_song` registers the song account on USDC with a storage deposit.
- The faucet rate-limits new account creation. User accounts created from `sonata.testnet` have only 1 NEAR, which is enough for gas and demo transactions.
- To create more top-level accounts later, retry the faucet after the 429 window.
