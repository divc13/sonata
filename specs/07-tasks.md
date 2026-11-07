# 07 - Tasks

Work is split into workstreams that can run in parallel once the foundation is in place. Each
workstream has a single owner (human or agent), a file boundary, and acceptance criteria. The spec is
the interface between workstreams; do not renegotiate it in code.

## Milestones

| Date (2026) | Milestone | Definition of done |
| --- | --- | --- |
| Nov 7 | Spec pack, repo, baseline | Specs merged, private repo pushed, Bun installed |
| Nov 8 | Contracts compile, deploy script | All five contracts deploy to testnet and pass unit tests |
| Nov 9 | End-to-end mint, pass, settle on testnet | One master minted, one pass bought, one epoch settled |
| Nov 10 | Web shell: catalog, player, pass gating | Listener can buy a pass and play a song |
| Nov 11 | Artist dashboard, publish, withdraw | Artist can publish and withdraw |
| Nov 12 | Market, master detail, audit | Sale works, old owner blocked, audit page live |
| Nov 13 | Polish, a11y, demo recording, README | Demo video recorded, public repo, X post drafted |
| Nov 14 | Submit | Public repo, video, X post, form submitted before 23:59 UTC |

## Workstreams

### WS0 - Foundation

**Owner:** coordinator.

Scope:

- Install Bun (`curl -fsSL https://bun.sh/install | bash`), run `bun install`, `bun run db:up`,
  `bun run db:migrate`, `bun run db:seed`, `bun run dev`.
- Create `.env.local` from `.env.example` with database, auth, NEAR, and oracle keys.
- Create `contracts/` Rust workspace and CI.
- Create `packages/near` with network config and contract id constants.
- Remove or disable the old JioSaavn, podcast, radio, show, mix, and AI routes from navigation.
- Add `NOTICE` and update `AGENTS.md` with the spec pointer.

Acceptance:

- `bun run dev` serves the existing app.
- `bun run test`, `bun run lint`, `bun run type-check` pass on the baseline.
- No secrets committed.

### WS1 - Master NFT and song account

**Owner:** contracts agent A.

Files: `contracts/master-nft/**`, `contracts/song-wallet/**`, `contracts/mock-usdc/**`,
`scripts/deploy-foundation.ts`.

Scope:

- Implement NEP-171, NEP-178, NEP-199 for `master-nft`.
- Keyless sub-account creation with `UseGlobalContract` and no `AddKey`.
- `song-wallet` with owner-gated `withdraw`, `withdraw_all`, reentrancy guard, no admin.
- `mock-usdc` NEP-141 with a demo mint.
- Deploy script for the three contracts.

Acceptance:

- `cargo test` passes.
- `near account view-account <song>` shows zero keys.
- Mint, transfer, payout split, withdraw, and old-owner-blocked tests pass.
- `song-wallet` has no method that can move funds except to the current owner.

### WS2 - Platform

**Owner:** contracts agent B.

Files: `contracts/platform/**`, `scripts/deploy-platform.ts`, `scripts/settle-epoch.ts`.

Scope:

- Pass NFT (NEP-171, non-transferable), `ft_on_transfer`, renewal.
- `register_song`, `settle_epoch`, `withdraw_revenue`, reserve targets, oracle, pause.
- Stats and epoch views.
- Settlement script that reads a JSON bundle.

Acceptance:

- Pass purchase and renewal tests.
- Settlement at R, pro-rata, zero hours, duplicate epoch, unsorted entries, missing song.
- Reserve withdrawal floor test.
- Only oracle can settle.
- The script settles a seeded epoch on testnet.

Depends on WS1 (collection address and wallet hash).

### WS3 - Market

**Owner:** contracts agent C.

Files: `contracts/market/**`, `scripts/deploy-market.ts`.

Scope:

- Listing, cancel, buy via `ft_transfer_call`, royalty split, `nft_transfer_payout` callback.
- Recovery path for stuck funds.

Acceptance:

- List, buy, royalty 5%, cancel, non-owner list, unapproved transfer, seller moved the NFT.
- Integration with WS1 and WS2 on testnet.

Depends on WS1 and WS2.

### WS4 - Settlement service and indexer

**Owner:** backend agent.

Files: `services/settlement/**`, `services/indexer/**`, `packages/db/src/schema.ts` (Sonata tables),
`packages/db/src/seed.ts`.

Scope:

- Listen ingest validation, daily cap, self-listen exclusion, epoch aggregation.
- Publish the audit bundle, submit `settle_epoch`.
- Index events into Postgres: songs, passes, epochs, payouts, listings, sales, ownership,
  withdrawals.
- Reorg-safe last-block cursor.

Acceptance:

- Given fixture events, the service produces the exact entries in `03-accounting.md`.
- The audit bundle hash matches the on-chain `listenRoot`.
- The indexer is idempotent on restart.
- `bun test` for the aggregation and cap logic.

Depends on WS2 (contract interface) and WS1 (events).

### WS5 - Web foundation and wallet

**Owner:** web agent A.

Files: `apps/web/app/(root)/**` (new Sonata routes only), `apps/web/components/sonata/**`,
`packages/near/**`, `packages/trpc/src/router/sonata/**`.

Scope:

- Add `packages/near`: wallet selector provider, network guard, contract clients, formatting.
- Add the Sonata tRPC router: songs, passes, artist, market, epochs, listens.
- New routes: `/`, `/masters`, `/master/[tokenId]`, `/artist/[handle]`, `/artist/dashboard`,
  `/artist/new`, `/market`, `/pass`, `/audit`, `/settings/wallet`.
- Remove old catalog links from the shell without breaking the design system.
- Empty, loading, error, disconnected states for every route.

Acceptance:

- The app builds and all routes render with seed data.
- Wallet connects to testnet and shows the account.
- Pass status reads from the contract and is cached for 30 seconds.
- No JioSaavn calls remain in the Sonata routes.

Depends on WS0. Can run in parallel with WS1.

### WS6 - Player, pass gating, listening

**Owner:** web agent B.

Files: `apps/web/components/player/**` (Sonata changes), `apps/web/hooks/use-listen-session.ts`,
`apps/web/app/api/listen/**`, `apps/web/app/api/audio/**`.

Scope:

- Repoint the player to Sonata masters and signed audio URLs.
- 30-second preview for no pass; full playback for active pass.
- Heartbeats every 15 seconds with a session token.
- Hidden tab, speed, and position checks.
- UI for "Pass required", "Preview", "Owner listens do not earn".

Acceptance:

- Listener with no pass hears 30 seconds.
- Listener with a pass plays the full track and events are stored.
- Hidden tab does not credit.
- The player never blocks on a chain call; it uses the cached pass.

Depends on WS5 and WS4 (listen API).

### WS7 - Artist dashboard, publish, withdraw

**Owner:** web agent C.

Files: `apps/web/app/(root)/artist/**`, `apps/web/components/sonata/publish/**`,
`apps/web/components/sonata/withdraw/**`.

Scope:

- Dashboard with stats, chart, master table, payout history.
- 3-step publish wizard, upload, metadata, mint transaction, success receipt.
- Withdraw sheet and transaction feedback.
- Owner-only visibility.

Acceptance:

- Publish creates a master and a song account on testnet.
- The dashboard reads the song balance and trailing earnings.
- Withdraw succeeds for the owner and fails for a non-owner.
- Empty state is designed, not a blank page.

Depends on WS1, WS5, WS4.

### WS8 - Master detail, market, audit

**Owner:** web agent D.

Files: `apps/web/app/(root)/master/**`, `apps/web/app/(root)/market/**`,
`apps/web/app/(root)/audit/**`, `apps/web/components/sonata/market/**`,
`apps/web/components/sonata/audit/**`.

Scope:

- Master detail with overview, ownership, listeners, chain tabs.
- Buy box, owner box, listing sheet.
- Market grid and filters.
- Audit page with stats, reserve bar, epoch table, settle button for the operator.

Acceptance:

- Buy flow completes and the ownership timeline updates.
- Old owner withdrawal fails in the UI with a clear error.
- Audit page links to the bundle and the explorer.
- Charts have a table fallback.

Depends on WS2, WS3, WS5, WS4.

### WS9 - Polish, QA, demo, submission

**Owner:** coordinator plus all agents.

Scope:

- Design pass against `05-design.md` and the design-system contract.
- Accessibility audit: keyboard, focus, contrast, reduced motion, mobile.
- Performance: no blocking chain calls, images sized, charts lazy.
- Seed and reset scripts, demo check.
- Record the 3-minute demo and the 60-second X video.
- README for judges, `NOTICE`, public repo, X post.

Acceptance:

- All items in `06-demo.md` pre-demo checklist pass.
- `bun run test`, `bun run lint`, `bun run type-check`, `bun run build` pass.
- Contract tests pass.
- Repo is public by 2026-11-14 23:59 UTC.

## File ownership

| Path | Owner | Notes |
| --- | --- | --- |
| `specs/**` | coordinator | Agents propose changes, coordinator merges |
| `contracts/**` | WS1/WS2/WS3 agents | One crate per agent, no cross-edits |
| `services/**` | WS4 | No direct edits from web agents |
| `packages/db/src/schema.ts` | WS4 | Web agents request changes |
| `packages/near/**` | WS5 | Interface frozen after Nov 9 |
| `packages/trpc/src/router/sonata/**` | WS5 | Routers may be extended by WS6/WS7/WS8 with coordinator approval |
| `apps/web/app/(root)/**` | WS5 | Route shells; each route owner may edit its own route |
| `apps/web/components/sonata/**` | route owners | Subfolders by feature |
| `apps/web/components/player/**` | WS6 | |
| `packages/ui/**` | frozen | Read-only, per the design-system contract |
| `apps/web/styles/globals.css` | frozen | Token changes need a shared change request |
| `docs/design-system/**` | frozen | Read-only |

## Agent rules

1. **Read the specs first.** Start with `README.md`, then the file for your workstream.
2. **One branch per workstream.** Use a worktree, commit with Conventional Commits.
3. **Do not change interfaces.** If a function, event, field, or error string in `02-contracts.md`
   is wrong, open a spec change first.
4. **No secrets.** Use `.env.local`; never commit keys, mnemonics, or RPC URLs with tokens.
5. **No `any`, no non-null assertions, no raw hex.** Follow `docs/design-system/CONTRACT.md`.
6. **Tests for money.** Any change to payouts, passes, sales, or withdrawals needs a unit test and an
   integration check.
7. **Do not edit `packages/ui` or frozen design files.** Request a shared change.
8. **Do not run heavy commands in parallel.** The machine has one heavy slot; queue installs,
   builds, and tests.
9. **Report blockers early.** If a dependency is not ready, build against the spec with fixtures and
   mark the integration as pending.
10. **Leave the demo green.** Before you finish, run the workstream's acceptance checks and post the
    commands and results.

## Dependency graph

```
WS0 ──► WS1 ──► WS2 ──► WS3
 │       │       │
 │       └───────┴──► WS4
 │                     │
 └──► WS5 ──► WS6 ─────┤
        │              │
        ├──► WS7 ──────┤
        └──► WS8 ──────┘
                       │
                       ▼
                      WS9
```

## Definition of done for the submission

- Public repo with a clear README, specs, and attribution.
- Contracts deployed to testnet with addresses in the README.
- A working demo URL or a recorded video if the deployment is not public.
- An X post with the video and a short explanation.
- The `nfts` track submission form completed.
- All money paths tested.
- The old owner cannot withdraw after a sale. This is non-negotiable.
