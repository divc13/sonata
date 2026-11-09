# Sonata pitch — v6 shot list

**Final:** `artifacts/sonata-pitch-final.mp4` · **2:42.0** · 1920×1080 ·
60 fps · H.264/AAC
**Final SRT:** `artifacts/sonata-pitch-final.srt`
**Review:** `artifacts/sonata-pitch-v6-review.mp4` · 2:42.0 · 1280×720
**Review SRT:** `artifacts/sonata-pitch-v6-review.srt`
**Master:** `artifacts/video-project/master-1080p60.mp4` · 1920×1080 · 60 fps
**Contact sheet:** `artifacts/video-project/contact-sheet.png`

**Voice:** Microsoft Edge TTS `en-US-AndrewNeural`, rate **-13%**, final
**1.055× atempo**. **150.2 wpm** voice-only; **140.7 wpm** full cut including the
closing hold. **380 words.**
**Music:** original generated ambient bed, **-18 dB** fader and **3:1
sidechain** duck; final mix **-14.0 LUFS**, true peak **-2.46 dBFS**.
**Previous final:** `artifacts/video-project/cuts/sonata-pitch-v5-1080p.mp4`
(v5, 2:31.42, 1080p) is preserved.

## Scenes (actual cut)

| #   | Time        | Surface / real action                                                                                                                                                                                      | Labels / proof                                                                                        |
| --- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | 00:00–00:15 | `/` home; cursor moves through the real shelf and stats; empty player masked                                                                                                                               | No role label; 12 masters, 5 for sale                                                                 |
| 2   | 00:15–00:39 | `/master/midnight-drive`: 30 s preview with the pass expired; `/pass` checkout; **real pass purchase**; back to the master; full playback; player masked on the pass page                                  | `Listener`; `$5 / 30 days`; pass tx; `$0.03 / verified hour`                                          |
| 3   | 00:39–01:08 | Real master page; **Chain** tab; song account, owner, creator and listing transaction; empty player masked                                                                                                 | `Master`, `1-of-1 NFT`, `Song account`, `No login key`, `Only the current owner can withdraw`         |
| 4   | 01:08–01:31 | `/artist/dashboard`: Slow Arc balance $1.00; **real withdraw**; Slow Arc master/ownership page; captions moved top-right so the table rows stay visible                                                    | `Artist`; live balance; real withdraw tx; owners/sales/payouts                                        |
| 5   | 01:31–02:05 | Loaded `/market`; open Midnight Drive; **real $50 buy**; manage defaults to Nadia (blocked); switch Collector (holder); switch Nadia (blocked); switch Collector; **real $50 relist**; empty player masked | `Buyer`; `Master bought` toast with real tx; `Includes $2.00`; `$2.00` balance; `5 listings active`   |
| 6   | 02:05–02:21 | `/pass` active; `/artist/dashboard` fixed rate; `/master/midnight-drive` creator royalty; clean $5.00 (cursor away) and player masked                                                                      | `$5 / 30 days`, `$0.03 / hour`, `4-hour cap`, `$3.60 / $1.40`, `5% royalty`                           |
| 7   | 02:21–02:42 | `/market` with five listings; home; one minimal end card; empty player masked                                                                                                                              | `12 masters · 5 listings`; `Past earnings · historical data`; `NEAR testnet · testnet USDC`; repo URL |

## Real transactions

| What                            | Transaction                                    | Notes                                              |
| ------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| Listener pass purchase          | `AhzvfcMPWsHzSsC664ygDSq7iQ2TxAMSVVEfwYqtqkdC` | `$5.00` testnet USDC; pass DB active to 2026-12-08 |
| Slow Arc balance funding        | `EiyP1ZwLd6yaPRxygdU4bSFRZKomjMrDgPNVmUGXyVU1` | `$1.00` from Nadia before the withdraw             |
| Artist withdraw (Slow Arc)      | `3qS5psRDUkT6YU36F61XDTHwMewnWRBidRZo5TpmZbQp` | `$1.00` to `nadia-sonata.testnet`                  |
| Midnight Drive balance funding  | `91Kd9SYG4xxhi1eu2DNzsujmeMrodk5qSCX3wFxdD79r` | `$2.00` from Nadia before the buyer scene          |
| Buyer purchase (Midnight Drive) | `BoXZxCrFvxgqfx4o2FrEoy5hhhxeBmAT8ngxpMMxhDkw` | `$50.00`; owner -> `collector.sonata.testnet`      |
| Relist (Collector, $50)         | `859S6n5ZP54YimKnMevi3enm53FgdZ1mX7VqvRZzPX2Y` | `market.list`; five active listings                |
| Approval prerequisite (retry)   | `EXTsD7sDjGiHdkJyzuy8VscD1i7q1pKju5UoyAyPVwSr` | manual `nft_approve`; the UI list then completed   |

The single inline receipt in the cut is the buyer's `Master bought` toast with
the `BoXZ…` transaction. The pass and withdraw scenes show their real pending
states; their hashes are recorded above and in
`artifacts/video-project/proof/proof-v6.json`.

## State restoration

- **Five active listings**; `midnight-drive` is one of them.
- `midnight-drive` is owned and relisted by **`collector.sonata.testnet`** at
  `$50.00`; the song account balance remains **`2000000` micro-USDC ($2.00)**.
- Slow Arc song account after the artist withdrawal: **`0`**.
- Listener pass is active in the cache until **2026-12-08** (the real purchase
  extended the testnet pass).
- USDC: collector **$130.00**, Nadia **$115.17**, listener **$10.00**, song
  account **$2.00**.
- The collector-owned/relisted state is intentional and allowed by the v6
  direction. The read-only check script is not used as a claim for this state;
  its Nadia-ownership expectation does not match the post-sale picture.

## Voice / audio

- Per-line Edge files: `artifacts/video-project/voice/*-edge-*.wav` and
  `manifest.json`; scene WAVs in `voice/scenes/`; `voiceover.wav`.
- Edge `--write-subtitles` phrase cues align the per-line caption words.
- The bed is generated by `video/src/music.mjs`; the review mix uses an -18 dB
  fader and a 3:1 sidechain keyed by the voice. No licensed track.
- ElevenLabs remains unavailable and was not called.
- Placeholder labels are not shown. The pass page says `Testnet checkout`; the
  close says `historical data`; the end card says `NEAR testnet · testnet USDC`.
