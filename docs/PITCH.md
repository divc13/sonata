# Sonata pitch script

**Status:** draft for voice-over and picture lock. **Target runtime:** 2:45–2:55.
**Narration:** 416 spoken words. **Delivery:** 150–155 wpm, with 8–9 seconds of
planned holds. **Track:** NEAR Hackathon 2026, `nfts`.

Speak over the action. Do not wait for animations, page loads, or transaction
toasts. Every second has a line or a deliberate hold.

## 1. Premise

> Sonata is a music platform where every master recording is a 1-of-1 NFT that
> owns its own bank account.

The metaphor that makes it land:

| Piece | Plain meaning |
| --- | --- |
| The master | a small business |
| The NFT | the deed to that business |
| The song's sub-account | the business's bank account |

One sentence for a judge: **the master is the account**.

## 2. Narration

Timecodes match the scene table below. Read only the paragraphs; the headings
are for the edit.

**[0:00–0:17]**

Sonata is a music platform where every master recording is a one-of-one NFT
that owns its own bank account. Think of the master as a small business: the
NFT is the deed, and its sub-account is the bank account.

**[0:17–0:32]**

Streaming pools money and hides it. Artists cannot see what a listener pays,
cannot hold the recording that earns, and cannot sell it with its income
attached. Sonata fixes that at the asset level.

**[0:32–0:49]**

Listeners pay five dollars for thirty days and play the whole catalogue. No
ads, no per-song purchase. The free tier is a thirty-second preview. The pass
is non-transferable, and renewal starts from the later of today and the
current expiry.

**[0:49–1:09]**

Here is the first claim: the song earns into its own account. The player sends
verified listening heartbeats. At settlement, the platform pays each master
three cents per verified hour, straight into the song's account. The cap is
four hours per listener per day, across all songs.

**[1:09–1:26]**

On the wallet side, every master is a standard NEP-171 token, and each one is
tied to a keyless NEAR sub-account. It has no login key. Nobody can sign into
it. It can only send funds to the current NFT owner.

**[1:26–1:46]**

The second claim: the artist withdraws from it, with a visible history.
Opening the master as its holder shows a manage panel with the song balance
and a withdraw action. The timeline under it lists the mint, every transfer
and sale, and each epoch payout as a receipt.

**[1:46–2:16]**

The third claim: the master sells with its account. A fixed-price sale moves
the NFT; the song account stays at the same address. The buyer gets the
balance and every future payout. The creator keeps five percent of every
resale; the seller gets the rest. One listener's pass pays at most three
dollars sixty in artist earnings a month. That is against five dollars of
revenue: a one-dollar-forty gross spread before infrastructure.

**[2:16–2:34]**

Now the sale mid-payout. The song account already holds a balance. After the
transfer, the previous owner tries to withdraw. The contract logs "Not the
owner" and nothing moves. The new owner withdraws the same balance
immediately. Owner changed. Balance moved. Old owner blocked.

**[2:34–2:55]**

That is Sonata: every master is an account that earns, pays its holder, and
transfers with the recording. The contracts, twelve masters and their song
accounts are live on NEAR testnet with mock USDC. The past earnings on screen
are seeded demo data. The transfers we show are real testnet transactions.

**Term discipline:** "NEP-171" appears once, in the wallet paragraph.
"Keyless NEAR sub-account" appears once, in the same paragraph. Do not add
"dynamic NFT", "programmable money", or "what comes after the JPEG" on the
fly.

**Delivery:** conversational, not announcer voice. Land the verbs "owns",
"earns", "withdraws" and "blocked". Take a half-beat after "bank account" and
after "asset level". Slow down on the numbers: three sixty, one forty, five
percent. Do not rush the proof strip; let the check marks land.

## 3. Scene table

Nine scenes. Times are cumulative. The narration excerpt is an anchor, not the
full read.

| # | Time | Visual | Narration excerpt | On-screen text |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:17 | `/`, dark 1440×900. Hero for Midnight Drive. Slow push on the cover, then the cursor drifts to the master card. Do not press Play yet. | "Sonata is a music platform where every master recording is a one-of-one NFT that owns its own bank account." | **Every song is an account.** / Master = business · NFT = deed · Sub-account = bank |
| 2 | 0:17–0:32 | Scroll the home shelves: 12 masters, 5 for sale, paid-to-artists total, verified hours, then the pass strip. Land on the Midnight Drive card. | "Streaming pools money and hides it… Sonata fixes that at the asset level." | **Streaming hides the money.** / The asset should earn. |
| 3 | 0:32–0:49 | `/pass`: the `$5.00 / 30 days` card and the free-preview table. Cut to the player at `0:30`, where playback pins and shows `30-second preview ended`. | "Listeners pay five dollars for thirty days… The free tier is a thirty-second preview." | **$5 / 30 days** / Free preview: 0:30 |
| 4 | 0:49–1:09 | `/master/midnight-drive`: press Play, let it pass `0:30`. Cut to a small terminal inset: newest `sonata_listen_event` row, `verified = true`; optionally the `/audit` payout row for Midnight Drive, labelled `seeded history`. | "Here is the first claim: the song earns into its own account." | **Earns into its own account** / `$0.03` per verified hour · 4 h/day cap |
| 5 | 1:09–1:26 | `/master/midnight-drive`: the **Chain** tab. Show the song account address, the global code hash, and `access keys: 0`. Small inset of the `check-demo.sh` line `access keys: 0`. | "On the wallet side, every master is a standard NEP-171 token… It can only send funds to the current NFT owner." | **Keyless song account** / 0 access keys · nobody can sign in |
| 6 | 1:26–1:46 | Three cuts. `/master/midnight-drive`: the **holder-only manage panel** (Owner box) with the song balance and `Withdraw earnings`. `/artist/dashboard`: withdraw **Slow Arc** and show the real tx. Back to `/master/midnight-drive`: the **Ownership / History timeline** with the mint, transfers, sales with prices, and epoch payout receipts. Keep Midnight Drive funded for the sale. | "The second claim: the artist withdraws from it… The timeline under it lists the mint, every transfer and sale, and each epoch payout as a receipt." | **Holder view: balance + withdraw** / **Every owner. Every payout.** / One receipt timeline. |
| 7 | 1:46–2:16 | `/market`: five listings, Midnight Drive at `$50.00` with trailing 30-day earnings. Open the master, show the buy box and "includes the song balance". Buy as the collector; show the receipt with the 5% / 95% split. | "The third claim: the master sells with its account… a one-dollar-forty gross spread before infrastructure." | **5% creator royalty** / `$50.00` · includes the song balance |
| 8 | 2:16–2:34 | Split screen: terminal + master page, in order. Owner before (`nadia-sonata.testnet`); the market buy tx `SUCCESS` (the NFT transfer); song balance before (`$2.00`); Nadia's `withdraw_all` log `Withdraw rejected: Not the owner`, balance unchanged; the collector's `withdraw_all` tx success, song balance `$0.00`, collector `+$2.00`; owner after (`collector.sonata.testnet`). Hold on the proof strip for two seconds. | "Now the sale mid-payout… Owner changed. Balance moved. Old owner blocked." | **Owner changed ✓ / Balance moved ✓ / Old owner blocked ✓** |
| 9 | 2:34–2:55 | `/`: the home hero. Slight pull-back to the wordmark. Optional 3-second inset of the **pre-sale** `check-demo.sh` run: `65 passed, 0 failed`, labelled `pre-sale chain check`. | "That is Sonata… The transfers we show are real testnet transactions." | **Every song is an account.** / NEAR testnet · mock USDC · seeded history labelled |

**Required shots satisfied:** the holder-only manage view and the per-master
history timeline are in scene 6; the sale-mid-payout proof strip is scene 8.

## 4. Caption plan

Burn the captions in; do not rely on platform captions.

- Two lines maximum, 36–42 characters per line.
- Default position: lower left, `x=64 px`, baseline `y=840 px` at 1080p, max
  width `720 px`.
- When the docked player is visible, lift the band to `y=760 px`, clear of the
  player bar that starts at `y=900 px`.
- On the full-screen player, use the top safe band, `y=120–200 px`, never the
  transport at the bottom.
- Never cover seek, play/pause, volume, queue, or the master action buttons.
  Keep each caption on screen for at least 1.8 seconds.

| Time | Line 1 | Line 2 |
| --- | --- | --- |
| 0:00 | Sonata: every master | is a one-of-one NFT |
| 0:04 | that owns its own | bank account. |
| 0:07 | The master is a business. | The NFT is the deed. |
| 0:11 | Its sub-account is | the bank account. |
| 0:17 | Streaming pools money | and hides it. |
| 0:20 | Artists can't see what | a listener pays, |
| 0:23 | can't hold the recording | that earns, |
| 0:26 | or sell it with its | income attached. |
| 0:29 | Sonata fixes that | at the asset level. |
| 0:32 | Five dollars, thirty days, | the whole catalogue. |
| 0:35 | No ads. No per-song | purchase. |
| 0:38 | Free tier: a 30-second | preview. |
| 0:41 | The pass is | non-transferable. |
| 0:44 | Renewal starts from the | later of today or expiry. |
| 0:49 | Claim one: the song | earns into its own account. |
| 0:53 | The player sends | verified listening heartbeats. |
| 0:57 | At settlement, each master | gets $0.03 per verified hour. |
| 1:01 | Straight into the | song's account. |
| 1:04 | Cap: four hours per | listener per day. |
| 1:07 | Across all songs. | |
| 1:09 | Every master is a | standard NEP-171 token. |
| 1:12 | Each is tied to a keyless | NEAR sub-account. |
| 1:15 | It has no login key. | Nobody can sign into it. |
| 1:18 | It can only send funds | to the current NFT owner. |
| 1:26 | Claim two: the artist | withdraws from it, |
| 1:29 | with a visible history. | |
| 1:31 | Open the master as its holder: | a manage panel shows |
| 1:34 | the song balance and | a withdraw action. |
| 1:37 | The timeline lists the mint, | every transfer and sale, |
| 1:41 | and each epoch payout | as a receipt. |
| 1:46 | Claim three: the master | sells with its account. |
| 1:49 | A fixed-price sale | moves the NFT; |
| 1:52 | the song account stays | at the same address. |
| 1:55 | The buyer gets the balance | and every future payout. |
| 1:59 | Creator keeps 5% | of every resale; |
| 2:02 | the seller gets the rest. | |
| 2:05 | $5 pass · $0.03/hour | 4 h/day cap |
| 2:08 | Max $3.60 payout | $1.40 gross spread |
| 2:12 | Before infrastructure. | |
| 2:16 | Sale mid-payout: | the account holds a balance. |
| 2:19 | After the transfer, the | old owner tries to withdraw. |
| 2:22 | Contract logs "Not the owner." | Nothing moves. |
| 2:25 | New owner withdraws | the same balance. |
| 2:28 | Owner changed ✓ | |
| 2:30 | Balance moved ✓ | |
| 2:32 | Old owner blocked ✓ | |
| 2:34 | Every master is an account | that earns and pays its holder, |
| 2:38 | and transfers with the recording. | |
| 2:41 | Contracts and 12 masters | live on NEAR testnet. |
| 2:44 | Mock USDC. | |
| 2:46 | Past earnings on screen | are seeded demo data. |
| 2:49 | Transfers shown are real | testnet transactions. |
| 2:52 | Sonata. Every song | is an account. |

## 5. Recording notes

### 5.1 Prep on localhost

Run this 30 minutes before the take. The app is `http://localhost:3000`; the
contracts and money writes are on **NEAR testnet**.

```bash
bun install
bun run db:up
bun run db:migrate
bun run db:seed
bun run dev
./scripts/check-demo.sh
```

Browser: 1440×900, zoom 100%, dark mode, 1080p, notifications off. Pre-open
`/`, `/pass`, `/master/midnight-drive`, `/artist/dashboard`, `/market` and
`/audit` in tabs so the first paint is warm.

Two pieces of state must be prepared, and both are documented with exact SQL
in [`docs/DEMO.md`](DEMO.md):

- **Free preview:** expire the listener's `sonata_pass` row, record the
  0:30 stop, then restore the row before the pass scene.
- **Live withdraw:** mint mock USDC into `slow-arc.masters-sonata.testnet`
  ($1.00) and `midnight-drive.masters-sonata.testnet` ($2.00) so the withdraw
  and sale-mid-payout scenes have a real balance to move. This is demo
  funding, not an epoch settlement.

The live sale is destructive to the pristine 12-master / 5-listing state.
Record the green `check-demo.sh` and any submission proof **before** the buy,
or use a disposable deployment for the sale.

### 5.2 Routes and actions

| Scene | Route | Action | Must be real |
| --- | --- | --- | --- |
| 1–2 | `/` | Hero, shelves, stats, pass strip. Click Midnight Drive. | Catalogue and art |
| 3 | `/pass` → player | Show `$5.00 / 30 days`; play to the `0:30` preview stop. | Preview enforcement |
| 4 | `/master/midnight-drive` + terminal | Play past `0:30`; show the newest verified listen row; optionally the payout row. | Verified heartbeat; payout |
| 5 | `/master/midnight-drive` | Open **Chain**; show song account, global code hash and `access keys: 0`. | Keyless account |
| 6 | `/master/midnight-drive` → `/artist/dashboard` → `/master/midnight-drive` | Show the holder-only manage panel and balance; withdraw Slow Arc; return to **Ownership / History** for mint, transfers, sales and payout receipts. Leave Midnight Drive funded. | Live withdraw tx; timeline screen |
| 7 | `/market` → `/master/midnight-drive` | Show five listings; open Midnight Drive at `$50.00`; buy as the collector. | Live buy tx; 5% / 95% split |
| 8 | Terminal + master page | Owner before/after, song balance before/after, Nadia's rejected withdraw log, collector's successful withdraw. | Live txs and logs |
| 9 | `/` | Home, wordmark, optional pre-sale chain check. | Pre-sale check only if labelled |

### 5.3 Testnet proof commands

The full sequence is in [`docs/DEMO.md`](DEMO.md). The short version:

```bash
source ops/testnet.env

# Owner before: nft_token("midnight-drive") -> nadia-sonata.testnet
# Song balance before: ft_balance_of(midnight-drive.masters-sonata.testnet) -> $2.00

# Old owner tries:
near contract call-function as-transaction \
  midnight-drive.masters-sonata.testnet withdraw_all \
  json-args '{}' prepaid-gas 100Tgas attached-deposit 0NEAR \
  sign-as nadia-sonata.testnet network-config testnet sign-with-keychain send

# Inspect the log: "Withdraw rejected: Not the owner"; balance unchanged.

# New owner withdraws:
near contract call-function as-transaction \
  midnight-drive.masters-sonata.testnet withdraw_all \
  json-args '{}' prepaid-gas 100Tgas attached-deposit 0NEAR \
  sign-as collector.sonata.testnet network-config testnet sign-with-keychain send

# Owner after: collector.sonata.testnet. Song balance: $0.00.
# Collector USDC: +$2.00.
```

The old-owner transaction **succeeds at the transaction level** and logs the
rejection. Do not show a failed-looking transaction, and do not use the
dashboard toast as proof. The proof is the log plus the unchanged balance.

For the sale itself, the NFT transfer is the market buy transaction. Show its
success receipt, then the owner view call. Do not call the SQL ownership
mirror an indexer; it is a demo stand-in.

### 5.4 What to blur

- Email addresses in the account menu, settings, browser profile, and any
  Postgres output.
- `.env.local`, shell environment dumps, `SONATA_*_SECRET_KEY`, private keys,
  seed phrases, keychain prompts, and signed-transaction JSON.
- Session cookies, auth tokens, `localStorage`, and any URL with a secret or
  API key.
- Wallet popups and notifications. Use a clean browser profile and hide the
  bookmarks bar.
- The macOS keychain dialog. Pre-authorize the CLI session, or use a recorded
  clip; never put the dialog on screen.

### 5.5 What is real, what is seeded

| Layer | State | How to treat it on camera |
| --- | --- | --- |
| Contracts | `masters`, `platform`, `market`, `usdc` deployed on testnet | Real; show IDs and tx hashes |
| Masters | 12 1-of-1 mints; each song account keyless, global code hash | Real |
| Listings | 5 active before the sale; 4 after | Say the count only before the buy |
| Pass | `listener.sonata.testnet` purchase is a real chain tx | Use the live path, or restore the seeded row and label it |
| Epoch history | 8 epochs, negative ids, labelled `Demo 1`–`Demo 8` | Seeded; label it every time it is on screen |
| Payouts, trailing 30-day, charts | Seeded in Postgres | Seeded; label it |
| Ownership / listing rows | Seeded until an indexer lands | The chain is authoritative; the SQL mirror is a demo stand-in |
| Song balances | Seed may show `$128.40`; the live account holds `$2.00` | Use the chain read for the proof; do not show both without a label |
| Live writes | Server-signed in `SONATA_DEMO_MODE=true` | Real testnet txs, demo signers, not a browser wallet |

Never say "guaranteed", "revolutionary", "world's first", "risk-free",
"profitable", or "mainnet". Do not call seeded roots, seeded tx hashes, or the
mirror a real proof. Do not claim a hidden tab is not credited; the current
player only stops counting when playback stops.

### 5.6 Claims that need engineering confirmation

| Claim / shot | Why it needs checking | Who owns it |
| --- | --- | --- |
| Holder-only manage view is actually absent for a non-holder | The screen is being built in parallel (`ws/holder-manage`). Confirm the route and that the gate is server-side, not just a hidden button. | Holder-manage workstream |
| The history timeline contains mint, transfers, sales, **and** epoch payouts | The current Ownership tab only has ownership rows; the parallel build (`ws/master-history`) adds payouts and listings. Confirm the final tab name and route. | Master-history workstream |
| The buy box's "includes $X" matches the live song account | The seed says `$128.40`; the funded live account holds `$2.00`. Confirm which value the buy box renders, or omit the number on camera and use the chain read. | Web / seed owner |
| "The transfers we show are real testnet transactions" | True only if the final take uses the live pass, buy, withdraw and transfer paths. If any scene uses a seeded receipt, change the closing line. | Demo lead |
| The pre-sale `check-demo.sh` clip is green and clearly labelled | The sale makes the pristine check fail. Record it first and label the inset `pre-sale chain check`. | Demo lead |
| Sale-mid-payout is covered by a transfer test | The track asks for transfer tests including a sale mid-payout; the demo sequence proves it live, but confirm the contract test name for Q&A. | Contracts owner |
| The README has the threat model the track asks for | This script points Q&A at [`specs/04-threat-model.md`](../specs/04-threat-model.md); confirm the README exposes or links the same section. | Submission owner |
| "Five listings" in scene 7 | True before the buy; false after. The narration avoids a count at the close, but keep the scene-7 line to the pre-buy state. | Edit / demo lead |

For questions, keep [`specs/04-threat-model.md`](../specs/04-threat-model.md)
and [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) open. Do not read them on camera.

### 5.7 Runtime check

| Block | Spoken words | At 150 wpm | Planned slot |
| --- | --- | --- | --- |
| Premise and problem (scenes 1–2) | 73 | 0:29 | 0:32 |
| Pass and preview (scene 3) | 40 | 0:16 | 0:17 |
| Earns into account (scene 4) | 47 | 0:19 | 0:20 |
| Keyless account (scene 5) | 41 | 0:16 | 0:17 |
| Withdraw and history (scene 6) | 48 | 0:19 | 0:20 |
| Sale and business model (scene 7) | 72 | 0:29 | 0:30 |
| Old owner blocked (scene 8) | 44 | 0:18 | 0:18 |
| Close (scene 9) | 51 | 0:20 | 0:21 |
| **Total** | **416** | **2:46** | **2:55 with holds** |
