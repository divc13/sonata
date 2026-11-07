# 05 - Design

## Direction

**Premium music, not crypto.** Sonata should feel like a record label's listening room: dark, warm,
quiet, and confident. The player is the hero. The money is present but calm. Chain details are one
layer down, in a details drawer or an audit page, never in the hero.

Three references in spirit, not in style:

- A hi-fi player: large artwork, generous spacing, a single warm accent.
- A private bank statement: clear numbers, receipts, no decoration on the money.
- A record sleeve: editorial type, strong covers, no gradients-for-the-sake-of-gradients.

The existing infinitunes design system is the base. Do not replace it. Read
`docs/design-system/tokens.md`, `docs/design-system/glass.md`, and
`docs/design-system/CONTRACT.md` before styling anything.

## Brand

| Element | Decision |
| --- | --- |
| Name | **Sonata** |
| Wordmark | Lowercase `sonata` in the heading font, tight tracking, no icon in the nav |
| Tagline | **Every song is an account.** |
| Accent | **Sonata Amber**, a warm gold. The exact hex lives in the token layer, never in components |
| Mood | Warm, analog, premium, honest |
| Avoid | Neon green, purple gradients, glassmorphism on content, coin icons, price tickers, "web3" |

### Accent

Set the default accent through the existing derivation pipeline (`deriveAccentTokens`) so light and
dark modes both clear WCAG AA. Suggested source: a warm amber around `#C8963E`. The derivation will
darken it on light surfaces (gold turns olive) and lighten it on dark surfaces. That is expected and
correct. Do not hand-pick two hexes.

Use amber only for:

- The primary play button and the active nav icon.
- The pass CTA and the "Withdraw" CTA.
- Earnings numbers and the positive delta.
- The focus ring (inherited from `--primary`).

Everything else is neutral: background, card, text, borders. The app should read as black and white
with a warm light on it.

**Implementation note:** the current default accent is neutral/rose. Changing the default is a
shared token change owned by the design-system unit. Log it as a "Needs shared change" item rather
than editing `packages/ui` or inventing raw hex in a component.

### Type

- Headings: the existing heading font (display).
- Body: the existing sans (Inter/system).
- Numbers: tabular figures for earnings, hours, and prices. Use `font-variant-numeric: tabular-nums`
  or the existing utility.
- Scale: use the token scale. Do not add a new display size.

### Imagery

- Covers are square, 1:1, 1200px minimum, with a subtle 1px inner rim.
- The now-playing background is a blurred, darkened cover wash, not a solid color.
- Artist avatars are circular, 1:1.
- No stock crypto imagery, no 3D coins, no abstract "blocks."

## Information architecture

Bottom nav (mobile) / sidebar (desktop):

| Item | Route | Purpose |
| --- | --- | --- |
| Home | `/` | Discover, top masters, new releases, pass status |
| Search | `/search` | Songs, artists, masters |
| Library | `/library` | Playlists, liked, recently played, your masters |
| Market | `/market` | Masters for sale |
| You | `/me` | Profile, pass, wallet, settings |

Secondary routes:

| Route | Purpose |
| --- | --- |
| `/master/[tokenId]` | Song detail, earnings, ownership |
| `/artist/[handle]` | Artist page and masters |
| `/artist/new` | Publish a master (3-step wizard) |
| `/artist/dashboard` | Earnings, withdrawals, payout history |
| `/pass` | Pass checkout and status |
| `/audit` | Epochs, reserve, listen roots (operator and public) |
| `/settings/wallet` | Connected wallet, network, USDC balance |

Remove from navigation: podcasts, radio, shows, mixes, AI assistant.

## Screens

### 1. Home

- **Hero**: a full-bleed featured master with cover, title, artist, play button, and a small
  "Earns $0.03 per verified hour" line. No carousel.
- **Your pass**: a slim status strip. If active: "Pass active, 23 days left" with a quiet link. If
  not: "Listen to everything for $5 / 30 days" with one CTA.
- **Top earning masters**: 6 cards with cover, title, artist, and trailing 30-day earnings. This is
  the signature row; it makes the economics visible without jargon.
- **New releases**: 8 cards.
- **From the label**: editorial row with a short note, optional.
- **Empty state**: if no masters, show "The catalog is being pressed" and a CTA to publish.

### 2. Now playing

- Full-screen on mobile, right-side panel on desktop, using the existing player shell.
- Large cover, title, artist, progress, queue.
- A single line under the title: "Earning $0.03/hr for @artist" while playing. No wallet address.
- Owner badge if the listener owns this master.
- The existing queue, volume, and controls stay.

### 3. Master detail

Header band:

- Cover, title, artist, play button, duration, release year.
- Badges: `Master`, `1 of 1`, `Owned by you` or `For sale`.
- A `Details` button opens a drawer with chain data.

Tabs:

- **Overview**: trailing 30-day earnings chart, verified hours, effective rate, current owner,
  creator, and "What this means" microcopy.
- **Ownership**: timeline of mint, transfers, sales, with prices and dates. Each row is a receipt.
- **Listeners**: 30-day verified hours, top countries (aggregate), no user identities.
- **Chain**: contract, token id, song account, `listenRoot` links. Monospace, copyable.

Buy box (if listed):

- Price, trailing 30-day earnings, implied annual yield (clearly labeled "estimate, not a promise"),
  "Includes $X in the song account", and a primary `Buy master` button.
- A secondary `Make an offer` is not in v1. Do not show it.

Owner box (if owned):

- Song account balance, `Withdraw` button, "Earnings are paid to the song, not to you personally."
- `Sell master` opens the listing sheet.

### 4. Artist dashboard

- Header: "Your masters" with total earnings, available to withdraw, and lifetime paid.
- A 30-day earnings chart with a segmented control: 7d / 30d / 90d.
- Master table: cover, title, owner, trailing 30-day earnings, balance, status, actions.
- Payout history: epoch, hours, rate, amount, tx link.
- `Publish a master` CTA.
- Empty state: a single, well-designed card explaining the model and a CTA.

### 5. Publish wizard

Three steps, one column, progress at the top. No modal.

1. **Audio**: drag and drop, waveform preview, duration, format check. Show "Your file stays private;
   listeners stream a signed URL."
2. **Details**: title, artist name, cover, genre, release date, description. A live preview card on
   the right.
3. **Publish**: summary, the song account address, the fixed rate, the 5% royalty, and a checkbox:
   "I own the rights to this recording." Primary button: `Publish master`.

Success state: a receipt with the token id, song account, and a link to the master. Confetti is
banned. Use a quiet amber rule and the words "Master published."

### 6. Pass

- A single card: "$5 / 30 days", what is included (all masters, unlimited, cancel anytime is false;
  say "no auto-renew"), and the payment method (USDC).
- Primary: `Get 30 days`.
- After purchase: a receipt with the expiry date and a `Start listening` CTA.
- States: wallet not connected, wrong network, insufficient USDC, pending, success, error.
- Do not show APY, token price, or gas estimates beyond a single "network fee" line.

### 7. Market

- Header: "Masters for sale" with a one-line explanation: "Buy the recording, and its account comes
  with it."
- Grid of listing cards: cover, title, artist, price, trailing 30-day earnings, "Includes $X".
- Sort: recent, price, earnings.
- A filter for "Owned by you" and "Created by you".
- Empty state: "No masters are listed. The first one could be yours."

### 8. Audit

- Public, linked in the footer under "How the money works."
- Top stats: platform balance, reserve target, coverage months, rate, total paid, next epoch.
- Epoch table: id, dates, hours, effective rate, total paid, mode (`constant` or `pro-rata`), root
  link, tx link.
- A "Settle epoch" button visible only to the operator wallet, with a confirmation dialog that shows
  the computed rate and total before submitting.
- A reserve bar: current balance vs one-month floor vs three-month target.
- This page is allowed to be dense. It is a statement, not a hero.

## Components

Reuse `@infinitunes/ui` wherever possible. New components live in `apps/web/components/sonata/`.
Do not edit `packages/ui`.

| Component | Notes |
| --- | --- |
| `MasterCard` | Cover, title, artist, optional earnings, optional price |
| `EarningsStat` | Label, tabular value, delta, optional suffix |
| `EarningsChart` | Area chart, 7/30/90, no gridlines except the baseline |
| `PassStatus` | Strip and card variants, uses `passExpiry` |
| `BuyMasterSheet` | Price, earnings, balance included, confirm |
| `WithdrawSheet` | Amount, destination (current owner), confirm |
| `PublishWizard` | 3 steps, shared form primitives |
| `OwnershipTimeline` | Receipt rows, no icons except a dot |
| `ChainDetails` | Drawer, monospace keys, copy buttons |
| `ReserveBar` | Balance vs floor vs target |
| `CopyField` | Truncated value with copy feedback |
| `EmptyState` | One illustration-free card, one CTA |
| `WalletChip` | Truncated account, network dot, connect/disconnect |

Use the existing `controlStyles`, `cn()`, and tokens. No raw hex, no arbitrary pixels, no inline
styles except dynamic chart values.

## Money display rules

- USD first, always: `$1,240.50`. Never `1.24 USDC` in the primary UI. Use `USDC` only in the
  details drawer and the pass receipt.
- Hours: `128.5 h`, one decimal. Seconds are never shown.
- Rate: `$0.03 / hr`, with the word "fixed" on the master page.
- Prices: `$50.00`, two decimals.
- Percentages: one decimal, for example `5.0% royalty`.
- Negative or zero: use `$0.00`, not a dash.
- Tabular numerals everywhere.

## Copy and voice

Plain, specific, warm. Short sentences. No hype.

Say:

- "Every song is an account."
- "Get 30 days of everything for $5."
- "This master earned $128.40 in the last 30 days."
- "The account moves with the master."
- "You are the owner, so you can withdraw."
- "The rate is fixed at $0.03 per verified hour."

Do not say:

- "Mint your NFT", "web3", "degen", "yield farm", "passive income", "guaranteed", "risk-free".
- "Revolutionary", "unlock the future", "the future of music".
- "Gas", "wallet address", "smart contract" in the primary flow. Put these in Details.

Use "master", "pass", "earnings", "owner", "account". Use "NFT" once on the master detail if needed
for clarity, in the details drawer.

## Motion

- Use the existing `--ease-*`, `--duration-*` tokens. No new curves.
- Page transitions: 250ms fade and 8px rise. The player morphs with `--ease-panel`.
- Numbers: count up over 400ms on first load only, not on every poll.
- Charts: draw once, then update without re-animating the axis.
- Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.

## Accessibility

- Reuse the token contrast guarantees. Every new text pair must pass AA.
- Focus visible on every interactive element.
- 44px touch targets on coarse pointers via `controlStyles`.
- Charts need a text summary and a table fallback.
- The player controls need accessible names and a keyboard path.
- The publish wizard is a real form with labels, not placeholder-only inputs.
- Errors are announced with `aria-live="polite"`.
- Do not use color alone for the pass status or the reserve bar. Pair with text.

## Responsive

- Mobile: one column, bottom nav, now-playing sheet, sticky buy/withdraw bar.
- Tablet: two columns for the master detail; the player becomes a bottom bar.
- Desktop: sidebar, 3-column grids, right-side player panel, max content width 1280px.
- The audit table scrolls horizontally on mobile; do not hide columns.

## What "done" looks like

- A first-time visitor understands the product in 5 seconds without knowing what an NFT is.
- A listener can buy a pass and play a song without seeing a wallet address.
- An artist can publish and see the song account address if they want it.
- A collector can see trailing earnings, buy, and see the balance in their account.
- The audit page makes the money legible to a judge.
- No screen looks like a crypto dashboard.
- `prefers-reduced-motion`, dark/light, and mobile all hold up.

## Design acceptance checklist

- [ ] All colors, radii, shadows, and spacing come from tokens. No raw hex.
- [ ] Glass is only on the navigation layer.
- [ ] The primary accent is the warm amber, applied through the token pipeline.
- [ ] Every money value uses tabular numerals and USD formatting.
- [ ] Every screen has empty, loading, error, and disconnected states.
- [ ] No em dashes or en dashes in copy.
- [ ] No crypto jargon in the primary flow.
- [ ] The player still feels like a music player, not a dapp.
- [ ] Mobile bottom bar does not cover the buy button.
- [ ] The audit page is readable on a phone.
