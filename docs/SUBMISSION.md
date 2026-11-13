# Sonata submission

NEAR Hackathon 2026, `nfts` track. Deadline: **2026-11-14 23:59 UTC**.

This is the submission checklist, the X copy, and the pre-public safety pass.
The lead owns the merge, the visibility change, and the final form.

## Checklist

### Must ship

- [ ] **Public repository** by 2026-11-14 23:59 UTC. Merge the work to `main`
      first; the public repo shows `main`.
- [ ] **README** with the product, architecture, live testnet addresses,
      quickstart, test commands and demo link.
- [ ] **3-minute demo video** uploaded and public. Put the URL in the README
      and the X post.
- [ ] **X post** with the video and a short explanation. Use the drafts below.
- [ ] **Testnet proof**: contract accounts, deployment transactions, mint/list
      transactions and the read-only `check-demo.sh` output.
- [ ] **Known limitations** stated honestly (below, and in the README).
- [ ] **Submission form** completed before the deadline.
- [ ] **License and attribution**: `LICENSE` (MIT) and `NOTICE` (Infinitunes)
      are intact.

### Nice to have, only if they are already green

- [ ] CI is green on `main`.
- [ ] `bun run fmt:check`, `bun run lint`, `bun run type-check`,
      `bun run test`, `bun run build`.
- [ ] `cargo test --manifest-path contracts/Cargo.toml --workspace`.
- [ ] `./scripts/check-demo.sh` exits 0.
- [ ] A short 60-second cut of the same demo for X (optional).

### Do not ship

- No `.env.local`, private keys, keychain exports, `~/.near-credentials`, or
  `sign-with-keychain` output with key material.
- No `node_modules`, `.next`, `contracts/target`, coverage, or screen recordings
  under `docs/**/evidence/`.
- No claim that the app is mainnet-ready, audited, profitable, or that the
  seeded history is live chain state.

## Hosted demo

**Live:** https://sonata-phi-green.vercel.app

- Vercel project: `divc13s-projects/sonata`
- Root Directory: `apps/web`
- Production alias: `sonata-phi-green.vercel.app`
- Database: Neon free plan, connected through the Vercel Marketplace
- Smoke tested: all Sonata routes `200`, tRPC reports `12` masters and `5` active
  listings, and password login works.

What judges should try:

1. Open `/` and play **Midnight Drive**. The player shows the song earning
   `$0.03/hr`; audio and covers are served from the deployment.
2. Open `/pass` and read the `$5 / 30 days` receipt (the pass is active).
3. Open `/market`, then `/master/midnight-drive` and its **Chain** tab: the master is
   a 1-of-1 NFT whose keyless song account holds the balance and received the payout.
4. Open `/audit` to see the historical epochs, the reserve context and the next real
   epoch id.
5. Sign in with the demo account to see `/library` and `/artist/dashboard`:
   `local@example.test` / `LocalDev123!`. This account is intentionally public and
   exists only in the demo database.
6. Try `/search?q=midnight` for the Sonata master search.

Notes for judges:

- Everything chain-related is **NEAR testnet** with mock USDC. There are no real
  funds and no mainnet deployment.
- The database contains a seeded demo snapshot (8 epochs at negative ids); it is not
  a claim of live on-chain settlement. The `/audit` page labels the seeded history.
- If the deployment is protected, the submission form carries the access
  instructions. Otherwise the link is open and demo writes (pass purchase, master
  sale, settlement) are expected to change testnet state.

## Testnet proof

The deployment record is [`ops/testnet.md`](../ops/testnet.md). It contains the
account table, contract code hashes, deployment transactions, the 12 mint
transactions, the five approve/list pairs and the listener pass purchase.

| Proof                                   | Where                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Contract accounts and NEAR balances     | `ops/testnet.md`, "Identifiers"                                                                                                 |
| Deployment transactions and code hashes | `ops/testnet.md`, "Deployed state"                                                                                              |
| 12 mint transactions                    | `ops/testnet.md`, "Demo chain writes"                                                                                           |
| Five listings (approve + list)          | `ops/testnet.md`, "Demo chain writes"                                                                                           |
| Pass purchase                           | `ops/testnet.md`, `3NDAvwfaDm2c3TAn2ypmfLNpLahoCHiCUaub3jSsdcqL`                                                                |
| Keyless song accounts                   | `./scripts/check-demo.sh`, `access keys: 0` for all 12                                                                          |
| Current platform state                  | `platform.get_stats`: `next_epoch_id = 1`, `total_paid = 0`, `rate_per_hour = 30000`, reserve targets `900000000` / `300000000` |

Run the proof yourself before submitting:

```bash
./scripts/check-demo.sh
```

Expected: `0 failed` and exit 0. On the current checkout it prints
`65 passed, 0 failed, 1 skipped` because the local `song_wallet.wasm` is not
built; build the contracts to enable the skipped hash check. Record the summary
line and the key PASS lines for the submission notes.

**Capture this proof before recording the live sale.** The sale moves
`midnight-drive` to the collector and consumes one listing, so a later
`check-demo.sh` on the same deployment will report the owner/listing mismatch.
Use a disposable deployment for the video if you need both the pristine proof
and the live sale.

### Current chain state (say this before a judge finds it)

As of 2026-11-08:

- The chain has settled **no epochs**: `platform.get_stats.next_epoch_id` is
  `1`, `total_paid` is `0`.
- Every song account currently holds **0 USDC**, because no settlement has
  funded it. A live artist withdraw would fail with `Nothing to withdraw`
  until the account is funded.
- Postgres is seeded with demo epochs at negative ids (`-1`…`-8`), so the
  `/audit` button reads the chain and offers `Settle epoch 1` — the first real
  epoch, because the contract initializes `next_epoch_id = 1` and has no
  epoch 0. `bun run scripts/settle-demo.ts 1` settles that same id.
- The demo script explains the two honest options: record the seeded audit
  history and show the command, or use a fresh chain + fresh database for a
  live settlement.

## X post (single)

Keep it at or under 280 characters. Replace only the URLs.

> Sonata: every song is an account. One $5 pass unlocks 12 masters on NEAR
> testnet; each verified listening hour pays the song $0.03, and selling the
> master moves its keyless wallet with it. 3-min demo: `<video-url>` Code:
> `<repo-url>`

Plain text for counting:

```text
Sonata: every song is an account. One $5 pass unlocks 12 masters on NEAR testnet; each verified listening hour pays the song $0.03, and selling the master moves its keyless wallet with it. 3-min demo: <video-url> Code: <repo-url>
```

If the URL pair pushes it over 280, drop `Code: <repo-url>` and put the repo in
the first reply.

## X thread (4 posts)

Each post is under 280 characters before the URL substitution.

**1/**

> Streaming pays artists fractions of a cent, pooled and opaque. Artists
> cannot sell a recording with its income history. Sonata makes the master the
> asset: one song = one 1-of-1 NFT that owns its own keyless NEAR account. 🧵

**2/**

> Listeners pay $5 for 30 days, not per song. Each verified listening hour
> pays the song's account $0.03. The cap is 4h/day, self-listens do not earn,
> and the platform holds a 3-month reserve.

**3/**

> Sell the master and the account goes with it: the buyer gets the recording,
> the wallet, its balance, and future income. The creator keeps 5%; the seller
> gets the rest. The old owner's withdrawal fails on chain.

**4/**

> 12 masters, 5 listings, live on NEAR testnet. 3-min demo: `<video-url>`
> Code: `<repo-url>` #NEAR #NFTs

## Pre-public checklist

Run from the repository root on the exact commit that will become public.

### 1. Clean tree and branch

```bash
git status --short
git branch --show-current
git log --oneline -5
```

The tree must contain only intended documentation or code changes. Do not
publish with an unmerged worktree branch as the public default.

### 2. No environment files or keys

```bash
git ls-files | grep -E '(^|/)\.env'
```

Expected: only `.env.example` (and any nested `.env.example`). `.env`,
`.env.local` and `.env.*.local` are ignored by `.gitignore` (`.env*` with the
example exceptions).

Secret scan:

```bash
git grep -nE 'BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY|ed25519:[A-Za-z0-9]{20,}|SECRET_KEY=[^ ]+' -- . ':!bun.lock'
```

Expected: no output. If it finds a documentation example, make sure it is a
placeholder, not a key.

Check for local absolute paths and keychain exports:

```bash
git grep -n '/Users/' -- README.md docs/DEMO.md docs/SUBMISSION.md docs/ARCHITECTURE.md || true
git ls-files | grep -Ei 'near-credentials|keychain|secret|mnemonic' || true
```

Expected: no output from the first command for the submission docs, and no
credential files from the second. Existing historical notes under
`docs/TODO.md`, `docs/archive/` and `docs/verification/` contain upstream
machine paths; they are not secrets, but scrub them if you want a spotless
public tree. `sonata.testnet` and the public account ids are fine.

### 3. Ignored build output and artifacts

```bash
git status --ignored --short | head -40
git ls-files -z | xargs -0 du -k 2>/dev/null | sort -nr | head -15
```

Expected ignored entries include `node_modules`, `.next`, `contracts/target`,
`.turbo`, and `.env.local`. The largest tracked files are the 12 demo audio
files at roughly 1.2–1.6 MB each (about 18 MB total) plus covers. That is
acceptable for a hackathon; do not add recordings or screenshots.

The repository already ignores:

- `.env*` (except `.env.example`)
- `.next`, `out`, `build`, `.turbo`
- `contracts/target`
- `docs/**/evidence/` (screenshots and recordings)

### 4. Links and placeholders

```bash
grep -REn '<demo-video-url>|<demo-app-url>|<repo-url>|<tx-hash>' README.md docs
```

Replace the real submission URLs before publishing. Keep `<tx-hash>` only where
a live transaction has not happened yet; never invent one. The testnet
transactions that are known are in `ops/testnet.md`.

Check that Markdown links resolve (the docs use relative paths):

```bash
python3 - <<'PY'
import os, re

files = ["README.md", "docs/ARCHITECTURE.md", "docs/DEMO.md", "docs/SUBMISSION.md"]
for path in files:
    text = open(path).read()
    for match in re.finditer(r"\]\(([^)]+)\)", text):
        target = match.group(1)
        if target.startswith(("http://", "https://", "#", "mailto:")):
            continue
        relative = target.split("#")[0]
        if relative and not os.path.exists(os.path.join(os.path.dirname(path), relative)):
            print(f"{path}: {target}")
PY
```

Expected: no output.

### 5. Confirm visibility, then make it public

```bash
gh repo view divc13/sonata --json visibility,url,defaultBranchRef
```

When the tree, README and video link are ready, merge to `main` and run:

```bash
gh repo edit divc13/sonata --visibility public --accept-visibility-change-consequences
```

`--accept-visibility-change-consequences` is required by the current `gh`
(2.87.3) whenever `--visibility` is used. Then verify from a logged-out browser:

```bash
gh repo view divc13/sonata --json visibility,url
```

Optional hardening if the org allows it:

```bash
gh repo edit divc13/sonata --enable-secret-scanning --enable-secret-scanning-push-protection
```

## Known limitations

State these plainly. They are already in the README and architecture note.

1. **Testnet only, mock USDC.** No real funds, no mainnet, no fiat on-ramp, no
   production custody.
2. **No event indexer.** Live chain writes (pass, buy, withdraw, list) are not
   mirrored into Postgres. The UI keeps the seeded owner/listing/pass rows.
   The chain is authoritative; the demo documents the mirror it uses on camera.
3. **Seeded history.** The eight epochs, per-song payouts, trailing-30-day
   charts and the on-screen pass receipt are seeded in Postgres. The contracts,
   12 masters, five listings and pass purchase are live testnet state.
4. **Epoch-id mismatch.** The chain has settled no epochs (`next_epoch_id = 1`)
   while Postgres seeds 1–8. A live settlement needs a fresh chain and
   database, or a reset of the seeded epoch/payout rows. The exact command is
   `bun run scripts/settle-demo.ts <epoch>` with `<epoch>` equal to the chain's
   next id.
5. **Song accounts are unfunded on chain.** They hold 0 USDC until a settlement
   (or the documented demo mint) funds them. A live withdraw before that fails
   with `Nothing to withdraw`.
6. **Demo signers, not a browser wallet.** `SONATA_DEMO_MODE=true` lets the
   server sign as the seeded roles. Keys are server-only; there is no
   wallet-selector connection in the browser.
7. **Publish is a UI stub.** The 12 masters were minted by
   `scripts/mint-demo.sh`; there is no upload/mint wizard.
8. **Some controls are presentational.** Market sort/filter pills and the
   dashboard range pills do not refilter data.
9. **Rejected withdrawals are logged, not thrown.** `song-wallet` logs
   `Withdraw rejected: <reason>` and the transaction succeeds so a rejected
   attempt cannot wedge the account. The UI does not parse the log, so its
   success toast is not proof. The old-owner scene uses the CLI and the
   unchanged balance.
10. **The audit page is a ledger view.** It shows the epoch table and payouts;
    the listen root is a short hash with the full value on hover. There is no
    published bundle file or reserve bar; reserve values are on chain.
11. **Not audited.** The contracts and accounting are a hackathon build, not
    production-audited code.

## Submission form notes

Use these facts; do not add claims the build does not support.

- **Track:** `nfts`.
- **One line:** Every song is an account: a 1-of-1 master NFT that owns a
  keyless NEAR account, earns $0.03 per verified listening hour, and sells with
  its wallet.
- **Network:** NEAR testnet.
- **Contracts:** `masters-sonata.testnet`, `platform-sonata.testnet`,
  `market-sonata.testnet`, `usdc-sonata.testnet`, plus the global
  `song-wallet` code hash.
- **Demo:** 3-minute video link, repository link, X post link.
- **What is new:** the master-plus-wallet ownership model and the fixed-rate
  subscription payout, both enforced on chain.
- **What is not done:** the known limitations above. Say "testnet by design;
  the USDC is a mock and the contracts are the deliverable."

## Final 10-minute pre-submit run

```bash
bun run fmt:check
bun run lint
bun run type-check
bun run test
bun run build
cargo test --manifest-path contracts/Cargo.toml --workspace
./scripts/check-demo.sh
```

If the live sale has already been recorded against the submission deployment,
`check-demo.sh` will report the changed owner/listing. Run it on the pristine
deployment (or before the sale) for the proof. Then open the README in a private
browser window, click every link, and confirm the video and X post are public.
The deadline is 2026-11-14 23:59 UTC; submit early enough to fix a broken link.
