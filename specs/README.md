# Sonata spec pack

Status: **v1, normative**. Last updated: 2026-11-07.

Sonata is a subscription music platform where every master recording is a 1-of-1 NFT that owns its
own NEAR account. Listeners pay once per month for unlimited access. Artists are paid a fixed dollar
rate for every verified listening hour, directly into the song's account. The master can be sold,
and its account balance moves with it.

This directory is the source of truth for what we build during the NEAR Hackathon 2026 `nfts` track.
When a spec and a habit disagree, the spec wins. When two specs disagree, the lower-numbered file
wins, except where a later file explicitly overrides it.

## Read order

1. `00-product.md` - what we are building and why.
2. `01-architecture.md` - system shape, repo layout, trust boundaries.
3. `02-contracts.md` - on-chain interfaces and state.
4. `03-accounting.md` - the money math, including reserve and pro-rata rules.
5. `04-threat-model.md` - what can go wrong and what stops it.
6. `05-design.md` - brand, screens, and the binding UI rules.
7. `06-demo.md` - the demo script and seed data.
8. `07-tasks.md` - workstreams, ownership, acceptance criteria.
9. `decisions.md` - the decision log with rationale.

## How agents use this pack

- **Read the relevant specs before writing code.** Do not infer product behavior from the old
  infinitunes code. The old catalog, podcasts, radio, shows, and AI assistant are out of scope.
- **Stay inside your workstream.** `07-tasks.md` lists file ownership. Do not edit another
  workstream's files without asking the coordinator.
- **Interfaces are contracts.** Function names, event names, field names, and error strings in
  `02-contracts.md` are exact. Do not rename them for style.
- **No product decisions in code.** If a spec is ambiguous, stop and write a question in the PR or
  in `specs/decisions.md` under "Open". Do not invent a third behavior.
- **Every money path needs a test.** Payouts, pass purchase, sale, royalty, and withdrawal must have
  unit tests plus at least one integration test.
- **Keep the UI music-first.** Chain details belong in drawers and detail pages, not in the hero.
- **No em dashes or en dashes** in code, comments, or user-facing copy. Use commas, colons, or
  parentheses. This matches the existing design-system contract.

## Glossary

| Term | Meaning |
| --- | --- |
| **Master** | The 1-of-1 NFT representing a sound recording. One song, one master, one owner. |
| **Song account** | The keyless NEAR sub-account that holds a master's USDC. It moves with the NFT. |
| **Pass** | A non-transferable NFT that grants 30 days of unlimited listening. |
| **Epoch** | A settlement window. The oracle reports verified hours, the platform pays artists. |
| **Verified hour** | A listening hour that passed the anti-fraud checks in `03-accounting.md`. |
| **R** | The fixed rate paid per verified hour. Demo value: $0.03. |
| **Reserve** | Platform funds held back to keep future payouts at R. Target: 3 months of payouts. |
| **Effective rate** | The rate actually paid this epoch. Equals R unless the reserve is short. |
| **Flush** | Moving a song's accrued payout into its song account. |
| **Creator** | The artist who minted the master. Receives the 5% secondary royalty. |
| **Owner** | The current holder of the master NFT. Controls the song account. |

## Non-negotiable constraints

- No fractional shares, no per-song subscriptions, no collaborator splits in v1.
- The song account has **no access keys**. Withdrawal requires
  `nft_token(token_id).owner_id == predecessor`.
- Payouts are **direct** to song accounts. There is no internal pending ledger.
- The rate `R` is a hard constant in v1. It cannot be changed after deployment.
- The platform keeps `revenue - payouts`. It cannot withdraw below the reserve floor.
- The pass is non-transferable and expires after 30 days.
- Testnet settlement currency is a mock USDC NEP-141. NEAR is used only for gas.
