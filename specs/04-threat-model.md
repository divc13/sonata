# 04 - Threat model

Scope: the demo system on NEAR testnet. Assets: USDC in the platform and song accounts, master
ownership, pass access, the rate promise, and the integrity of earnings data.

## Actors

| Actor | Capability | Motivation |
| --- | --- | --- |
| Listener | Buys passes, plays songs, sends heartbeats | Cheap access, free listening |
| Artist | Mints masters, withdraws earnings, lists resale | Maximize payouts, sell at a high price |
| Collector | Buys masters | Acquire income, flip |
| Platform operator | Owns platform and collection, sets oracle and reserve targets | Revenue, solvency |
| Oracle | Submits epochs | Accurate payouts, or self-dealing if compromised |
| Attacker | Any of the above, plus external | Free listening, inflated payouts, theft, spam |
| Judge / auditor | Reads chain and bundle | Verify claims |

## Trust assumptions

1. NEAR testnet is live and finality is as documented.
2. The mock USDC contract is trusted and has no real value.
3. `master-nft` is the ownership oracle for song accounts. Its admin key is honest.
4. The oracle key is honest in normal operation. It is the weakest link.
5. The web server is honest for pass and listen checks. A malicious server can grant free listening
   but cannot move funds.
6. The user's wallet key is theirs. The platform never holds listener keys.

## Threats

### T1. Seller keeps access after selling the master

**Attack**: Seller lists the NFT, receives payment, and calls `song-wallet.withdraw` before or after
the transfer.

**Mitigation**:
- `song-wallet` has no cached owner. `withdraw` calls `master-nft.nft_token(token_id)` and requires
  `owner_id == predecessor` in the callback.
- The market transfers the NFT (`nft_transfer_payout`) **before** releasing USDC to the seller.
- The old owner's withdrawal after the transfer panics with `"Not the owner"`.
- The seller can withdraw **before** the sale; that is legitimate. The listing UI shows the current
  song account balance and the price should reflect it.
- The sale is atomic per receipt chain: NFT transfer, then royalty and seller payment.

**Residual**: A seller and buyer can trade off-market; the song account still moves with the NFT, so
the buyer is protected, but the 5% royalty is not enforced.

### T2. Buyer does not receive the wallet

**Attack**: Seller transfers the NFT away after listing, or the market fails to move the wallet.

**Mitigation**:
- The song account is created at mint and is permanently bound to the token id. There is no separate
  wallet transfer.
- `market.ft_on_transfer` re-reads `nft_token` and checks `owner_id == listing.seller` at buy time.
  If the seller moved the NFT, the buyer is refunded and the listing is cancelled.
- The market uses `nft_transfer_payout` so the NFT move and the payout calculation are one call.

**Residual**: A malicious collection upgrade could rebind ownership. The collection admin is trusted.

### T3. Oracle underreports to pay artists less

**Attack**: The oracle omits or truncates listen events to reduce payouts, keeping more platform
revenue.

**Mitigation**:
- The full listen bundle is published and hashed on chain (`listenRoot`).
- The indexer stores per-user, per-song seconds, so artists can recompute their payout.
- The audit page shows total hours, effective rate, and per-song payouts.
- The rate is immutable, so the oracle cannot change `R`.
- Community or judge recomputation is possible from the bundle.

**Residual**: There is no on-chain fraud proof in v1. If the oracle lies consistently, artists must
escalate socially. A v2 can add listener-signed receipts and a challenge window.

### T4. Oracle overreports to drain the treasury

**Attack**: A compromised oracle submits inflated hours, paying attacker-controlled song accounts.

**Mitigation**:
- Payouts are bounded by the platform balance. The oracle cannot mint USDC.
- The platform owner can `pause` settlement.
- The oracle key is separate from the owner key and lives only in the settlement service.
- The reserve floor blocks owner withdrawals, so a drain is visible.
- The audit bundle makes anomalies detectable.

**Residual**: A compromised oracle can drain the entire liquid platform balance in one epoch. A
per-epoch cap and a challenge period are v2 hardening. For the demo, the balance is small and the
key is local.

### T5. Sybil and farming

**Attack**: A user buys many passes and listens 24/7 to extract more than the pass price.

**Mitigation**:
- The 4-hour daily cap is enforced server-side across all songs.
- At $5 and $0.03/hour, break-even is 166.67 hours. The cap allows 120 hours, so max payout per
  pass is $3.60. A rational farmer loses $1.40 per pass.
- Self-listening by the owner and creator is excluded.
- A pass is non-transferable, so it cannot be resold after farming.
- Concurrency is limited to 3 sessions per account.
- Events are deduped by session and position, and hidden-tab time is not credited.

**Residual**: A user can run multiple accounts with multiple passes; each still loses money at max
usage. A user can listen while doing something else; that is real listening and is allowed.

### T6. Free listening without a pass

**Attack**: Call the audio URL directly, replay a session token, or patch the client.

**Mitigation**:
- Audio URLs are signed, short-lived URLs from the API; the bucket is private.
- The player sends a server-issued session token; the API checks the pass on every heartbeat and on
  the audio URL issuance.
- The 30-second preview is the only unauthenticated audio.
- The pass is an NFT; the backend reads the contract view and caches for at most 30 seconds.

**Residual**: A user with a valid pass can record the stream. That is unavoidable and out of scope.

### T7. Reentrancy and callback abuse

**Attack**: A malicious receiver reenters `withdraw`, `ft_on_transfer`, or the market callback.

**Mitigation**:
- `song-wallet` has an `is_claiming` guard and resets it in the callback.
- `platform.ft_on_transfer` checks the payment token and mints state before returning.
- `market` re-reads the listing and token in the callback and is idempotent via `listing.active`.
- `settle_epoch` advances `next_epoch_id` before issuing transfers, so a second call cannot replay.
- No contract calls an untrusted contract while holding a mutable borrow across a state change.

**Residual**: Async promise failures can leave funds in the market. The owner `recover` path is a
safety valve, tested in the demo.

### T8. Rate change or bait-and-switch

**Attack**: The platform lowers `R` after artists publish.

**Mitigation**:
- `rate_per_hour` is set in `new` and has no setter. It is immutable.
- Any change requires a new platform contract and a migration, which is public and visible.
- The UI shows `R` and the immutable flag on the master page.

**Residual**: None on chain. A new platform could be deployed, but artists would have to opt in.

### T9. Reserve shortfall

**Attack**: The platform over-commits, then cannot pay `R`.

**Mitigation**:
- Payouts are capped by the actual balance: `effective = min(R, balance * 3600 / totalSeconds)`.
- The platform cannot withdraw below `max(reserve_target, one_month_reserve)`.
- The audit page shows coverage months, reserve target, and the current mode.
- The pro-rata rule is automatic and emits `"mode":"pro-rata"`.

**Residual**: In a shortfall, artists are paid less than `R` for that epoch. The event and UI make it
visible. The reserve is the buffer that prevents this in normal operation.

### T10. Self-dealing and wash trading

**Attack**: An artist buys their own master to create a price history, or lists at an inflated price.

**Mitigation**:
- The UI shows trailing 30-day earnings, not just the asking price.
- The indexer labels self-sales (`seller == buyer`) and excludes them from "recent sales".
- The royalty is 5%; a wash trade costs the creator 5% unless creator == seller, in which case it
  costs gas only. The UI shows the creator and the royalty.
- The marketplace is not an investment product; no yield is promised.

**Residual**: Wash trading is possible. It is disclosed and not rewarded by the platform.

### T11. Mint spam and storage exhaustion

**Attack**: Mint thousands of masters to bloat the collection and consume NEAR.

**Mitigation**:
- `nft_mint` requires a storage deposit (default 0.1 NEAR) and creates a sub-account with its own
  storage.
- The attacker pays for every account.
- The UI hides unverified artists; the audit page counts mints per account.
- A v2 can add an allowlist or a mint fee.

**Residual**: Testnet NEAR is cheap; spam is possible but not profitable.

### T12. Key compromise

**Attack**: Steal the platform owner key, the oracle key, or a user wallet.

**Mitigation**:
- The owner key is a multisig in production. Demo uses a single key in `.env.local`, never committed.
- The oracle key is separate and only in the settlement service.
- Song accounts have no keys; there is nothing to phish.
- The platform can pause settlement and pass sales.
- The reserve floor limits owner withdrawal damage.

**Residual**: A compromised owner can change the oracle and reserve targets and withdraw above the
reserve. The demo accepts this; production requires a timelock and a multisig.

### T13. Pass sharing and concurrency

**Attack**: Share a pass with many people.

**Mitigation**:
- The pass is bound to an account and non-transferable.
- Concurrency limit: 3 active sessions per account. New sessions evict the oldest.
- Device fingerprint and IP heuristics are logged, not enforced in v1.
- The UI shows "playing on another device" when the limit is hit.

**Residual**: A family or friend group can share one pass within the concurrency limit. This is
acceptable for v1.

### T14. Marketplace front-running and approval abuse

**Attack**: A seller approves the market, then revokes; or a buyer races a price change.

**Mitigation**:
- Listings are fixed price and stored on chain.
- `buy` re-checks `token.owner_id == listing.seller` and `listing.active`.
- If the seller revokes the approval, `nft_transfer_payout` fails and the buyer is refunded.
- The seller cannot change the price without cancelling and relisting, which emits an event.
- Approvals are cleared on transfer by the collection.

**Residual**: A seller can cancel a listing during a buy; the buyer is refunded. Acceptable.

### T15. Data integrity of the audit bundle

**Attack**: The oracle publishes a bundle that does not match the on-chain root.

**Mitigation**:
- The bundle is pinned before settlement and its hash is passed as `listenRoot`.
- The indexer stores the same bundle and the tx hash.
- The audit page links both.
- Anyone can hash the bundle and compare.

**Residual**: The hash is only as good as the publisher. A v2 should store a Merkle root of
per-user rows on chain and allow proofs.

## Out of scope

- Legal ownership of sound recordings, ISRC registration, label agreements.
- Real USDC or mainnet funds. The mock token has no value.
- Bridge risk, fiat rails, tax reporting.
- Music rights infringement by uploaded audio. The demo uses royalty-free tracks and a takedown
  policy is documented for production.
- Browser malware or a compromised user device.

## Security checklist for the demo

- [ ] Song accounts have zero access keys (verify with `near account view-account`).
- [ ] `song-wallet` has no admin or upgrade method.
- [ ] `rate_per_hour` has no setter.
- [ ] Pass `nft_transfer` panics.
- [ ] Oracle cannot call `withdraw_revenue` or `buy_pass`.
- [ ] Owner cannot withdraw below the reserve.
- [ ] Old owner withdrawal after sale fails.
- [ ] Duplicate epoch settlement fails.
- [ ] Pro-rata path tested with a small balance.
- [ ] Oracle key is not in the repo or the browser bundle.
- [ ] Listener session tokens are not reusable.
- [ ] `bun run test` and contract tests pass.
