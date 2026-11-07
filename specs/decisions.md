# Decision log

Format: **D-NN, decision, status, rationale, consequences.** Status is `locked`, `open`, or
`superseded`. Locked decisions cannot be changed in code without updating this file first.

---

### D-01 - Master-only NFT, 1-of-1

**Status:** locked.

Each song master is a single NFT. No editions, no fractional shares, no royalty-share tokens.
Rationale: the story is "the master is the asset." Fractions add securities questions and a second
market to build. One master per recording is the industry unit.

Consequences: a master cannot be co-owned. Collaborator splits are out of scope in v1.

---

### D-02 - Platform-wide monthly pass, not per-song

**Status:** locked.

One $5 pass unlocks every master for 30 days. Listeners do not pay per song.
Rationale: a music product must feel like a catalog, not a checkout. The pass is the revenue pool
that funds all artist payouts. Per-song subscriptions fragment the experience and make the accounting
harder.

Consequences: the platform is the merchant of record. Artist payouts must be allocated from the pool
by verified listening, not by direct sales.

---

### D-03 - Fixed rate per verified listening hour

**Status:** locked.

Artists are paid `R = $0.03` per verified listening hour, capped at 4 hours per listener per day.
Rationale: a legible, predictable promise. It is easy to explain and easy to audit. It avoids the
per-stream opacity that artists complain about.

Consequences: the platform must cap usage to stay solvent. The cap is a product constraint, not a
growth hack. See D-06.

---

### D-04 - Platform keeps the remainder

**Status:** locked.

After artist payouts, the platform keeps `revenue - payouts`. There is no explicit percentage fee in
the UI. The margin funds operations and the reserve.
Rationale: simpler than a fee line, and honest: the platform's take is visible in the public audit.
A fee on top of the payout would be a second number to explain.

Consequences: the audit page must show the platform balance and the reserve so the margin is not
hidden. The platform cannot withdraw below the reserve floor.

---

### D-05 - Three-month reserve, pro-rata below one month

**Status:** locked.

Reserve target is 3 months of trailing payouts. If the balance would not cover `R` for an epoch, the
effective rate is pro-rata from the available balance. The platform cannot withdraw below
`max(reserve_target, one_month_reserve)`.
Rationale: protects the rate promise without letting the reserve block artist payouts. Artists are
paid first; the reserve is a withdrawal lock and a buffer.

Consequences: in a shortfall, artists are paid less than `R` for that epoch. The event and the audit
page label the mode as `pro-rata`.

---

### D-06 - 4-hour daily verified cap

**Status:** locked.

A listener can earn at most 4 verified hours per day across all songs. Break-even for a $5 pass is
166.67 hours; the cap allows 120 hours, so max payout per pass is $3.60.
Rationale: without the cap, a 24/7 listener would generate $21.60 in payouts and the pass would be
loss-making. The cap makes the unit economics positive and is a natural "fair use" limit.

Consequences: the server must enforce the cap, not the client. The cap is per account, not per song,
which prevents splitting across songs.

---

### D-07 - Direct settlement to song accounts

**Status:** locked.

Payouts are transferred directly from the platform to each song account at epoch close. There is no
internal pending ledger.
Rationale: the song account balance is the artist's balance. It is simpler to audit, and it makes the
"wallet moves with the master" story literal. A pending ledger would add a second claim on the
platform and a second place to get the accounting wrong.

Consequences: settlement issues one `ft_transfer` per earning song. For the demo (12 songs), this is
fine. A production version can batch or use a Merkle claim if the catalog grows.

---

### D-08 - Keyless song sub-accounts

**Status:** locked.

Each song account is a NEAR sub-account with a contract and **zero access keys**. It can only move
USDC via `withdraw`, which checks that the caller is the current NFT owner.
Rationale: there is nothing to phish or leak. The ownership check is on chain. The account is a
literal embodiment of the master.

Consequences: no admin recovery if the wallet contract has a bug. The wallet is immutable and small.
The collection is the trust root. Song accounts cannot be upgraded individually.

---

### D-09 - Non-transferable pass NFT

**Status:** locked.

The pass is an NFT for ownership and composability, but it cannot be transferred.
Rationale: a transferable pass would create a secondary market and break the per-account cap. A
non-transferable pass is a membership, not a ticket.

Consequences: `nft_transfer` panics. Renewal extends the existing pass. The backend reads expiry from
the contract.

---

### D-10 - Fixed-price resale, 5% creator royalty

**Status:** locked.

Masters sell at a fixed price. The creator gets 5% of every secondary sale. No auctions, no offers.
Rationale: simple to build, simple to explain, and enough to show the asset market. Auctions add
complexity without proving the thesis.

Consequences: price discovery is manual. The UI shows trailing earnings and an estimated yield, not a
promise.

---

### D-11 - Immutable rate in v1

**Status:** locked.

`rate_per_hour` has no setter. A change requires a new platform contract and a migration.
Rationale: the user asked for a pre-decided constant. Immutability is the strongest possible answer to
"will you lower the rate later?"

Consequences: if the economics are wrong, the fix is a redeploy. The demo accepts this.

---

### D-12 - Mock USDC on testnet

**Status:** locked.

Settlement uses a NEP-141 mock USDC with 6 decimals. NEAR is used only for gas. Production USDC via
NEAR Intents is roadmap, not v1.
Rationale: no real funds, no fiat rails, no bridge risk in the demo. The accounting is identical to
real USDC.

Consequences: the demo must say "testnet, mock USDC." The mock is clearly labeled and not deployed on
mainnet.

---

### D-13 - Reuse infinitunes, replace the catalog

**Status:** locked.

Keep the infinitunes shell, design system, auth, Postgres, tRPC, and player. Remove the JioSaavn
catalog, podcasts, radio, shows, mixes, and AI assistant. Add Sonata data, contracts, and routes.
Rationale: the UI is strong and the hackathon is about the asset model, not rebuilding a player. The
MIT license permits reuse with attribution.

Consequences: the app keeps the upstream look and feel, which is good. The old routes must be removed
from navigation so judges do not see dead catalog features. `NOTICE` credits the original author.

---

### D-14 - Oracle with a published audit bundle

**Status:** locked.

A single oracle key submits epochs. Every epoch publishes a JSON bundle of verified listening seconds
and stores its hash on chain.
Rationale: a single signer is the simplest thing that works for a demo. Transparency is the
mitigation. A threshold committee or zk proof is v2.

Consequences: the oracle is trusted. The audit page and the bundle are mandatory, not optional. The
threat model documents the residual risk.

---

### D-15 - Self-listens do not earn

**Status:** locked.

The owner and the creator of a master do not earn from listening to it.
Rationale: prevents farming your own master and inflating the payout. It is a simple rule and easy to
enforce in aggregation.

Consequences: a artist cannot "test" earnings by listening to their own song. The UI must say so.

---

### D-16 - Hide crypto jargon in the primary UI

**Status:** locked.

Use "master", "pass", "earnings", "owner", "account". Put "NFT", "wallet", "contract", "token id",
and "gas" in a details drawer or the audit page.
Rationale: the product must look like a premium music service, not a crypto dapp. The technology is
the how, not the headline.

Consequences: the design review must check the copy. The pitch can use NFT terms; the UI leads with
music.

---

## Open

None. Add new open questions here with a proposed decision and do not ship code that depends on the
answer until the coordinator marks it `locked`.
