# Pinata / IPFS for the demo masters

This is an **optional permanence layer**. The live demo always plays the committed files under
`apps/web/public/demo/`; the Pinata pipeline only adds content-addressed copies and an NFT metadata
JSON to IPFS. If `PINATA_JWT` is unset, nothing here runs and the demo is unaffected.

The uploader is `scripts/upload-pinata.ts`. It reads the twelve songs from
`apps/web/public/demo/manifest.json`, uploads each cover and audio file with Pinata's
`pinFileToIPFS`, then pins one ERC-721/NEP-171-style metadata JSON per song with
`pinJSONToIPFS`. It writes `apps/web/public/demo/manifest.ipfs.json`; it never edits the original
manifest.

## 1. Create a Pinata JWT

1. Sign in at <https://app.pinata.cloud/>.
2. Open **Developers -> API Keys -> New Key** (or <https://app.pinata.cloud/developers/api-keys>).
3. Give it a name such as `sonata-demo`, an expiry that covers the hackathon, and the pinning
   permissions for `pinFileToIPFS` and `pinJSONToIPFS`. No admin scope is needed.
4. Copy the **JWT** once. Treat it like a password.

The JWT is a standard three-part token. The script checks the shape and expiry before it uploads,
then sends it as `Authorization: Bearer <jwt>`. It is never printed, logged, or written to
`manifest.ipfs.json`.

## 2. Configure it

Put the JWT in `.env.local` at the repository root (ignored by git):

```bash
PINATA_JWT=<your-jwt>
```

Bun loads `.env` and `.env.local` automatically for `bun scripts/...`. You can also pass it
inline for a one-off run:

```bash
PINATA_JWT=<your-jwt> bun scripts/upload-pinata.ts --upload
```

Optional: use a dedicated gateway for the player instead of the shared public one.

```bash
PINATA_GATEWAY=https://your-gateway.mypinata.cloud/ipfs
```

The default is `https://gateway.pinata.cloud/ipfs`. Trailing slashes are fine.

**Security rule:** `PINATA_JWT` is server-side only, in `.env.local` or the shell. Never add a
`NEXT_PUBLIC_` prefix, never commit it, never paste it into a screenshot, issue, or chat, and never
put it in a browser bundle or a `public/` file. If it leaks, revoke it in Pinata and create a new
key. `ops/testnet.env` is for public identifiers only; it is not a place for this token.

## 3. Dry run (no credentials, no network)

```bash
bun scripts/upload-pinata.ts            # --dry-run is the default
bun scripts/upload-pinata.ts --dry-run
```

The dry run:

- parses and validates `manifest.json` (slug rules, required fields, media extensions, unique token
  ids, no `..` in paths);
- checks that every cover/audio file exists under `apps/web/public/` and is non-empty;
- computes the sha256 of each file;
- compares against an existing `manifest.ipfs.json`;
- prints `upload` / `skip` for every cover and audio file, plus `pin` / `skip` for metadata.

It makes no HTTP request and does not require `PINATA_JWT`.

## 4. Upload

```bash
bun scripts/upload-pinata.ts --upload
```

The uploader is idempotent and resumable:

- A CID is reused only when `manifest.ipfs.json` records a CID **and** the local file's sha256 is
  unchanged. Changed or never-uploaded files are pinned again.
- Metadata is reused only when both media CIDs are known and the sha256 of the canonical metadata
  JSON matches the recorded value. A changed cover or audio CID produces a new metadata JSON and a
  new metadata CID.
- Progress is written after every successful pin. If the network or Pinata fails partway, the error
  says how many songs completed; re-run `--upload` and it resumes without re-pinning finished
  files.
- Nothing is deleted or unpinned. Removing a song from the manifest leaves its pins in Pinata;
  unpin manually in the Pinata dashboard if needed.

## 5. What is stored where

`manifest.ipfs.json` is a generated, credential-free file and is safe to commit after a real
upload. Per song it records:

| Field                                      | Meaning                                                              |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `coverCid`, `audioCid`                     | IPFS CIDs of the uploaded cover and audio                            |
| `metadataCid`                              | CID of the pinned metadata JSON                                      |
| `metadataUri`                              | `ipfs://<metadataCid>`                                               |
| `gatewayUrl`                               | HTTP gateway URL for the metadata JSON                               |
| `coverGatewayUrl`, `audioGatewayUrl`       | HTTP gateway URLs for the media (what a browser can play/show)       |
| `files.cover.sha256`, `files.audio.sha256` | sha256 of the local source files, used for skip checks               |
| `metadataSha256`                           | sha256 of the canonical metadata JSON, used for metadata skip checks |
| `metadata`                                 | the exact JSON that was pinned                                       |
| `onChain`                                  | the values to put in `TokenMetadata`                                 |

The pinned metadata JSON is:

```json
{
  "name": "Midnight Drive",
  "description": "A wide-open synthwave cruise...",
  "image": "ipfs://<coverCid>",
  "animation_url": "ipfs://<audioCid>",
  "properties": {
    "token_id": "midnight-drive",
    "artist": "Nadia Vale",
    "artist_handle": "@nadia",
    "artist_account": "nadia-sonata.testnet",
    "genre": "Synthwave",
    "release_year": 2026,
    "duration_sec": 90,
    "cover": "ipfs://<coverCid>",
    "audio": "ipfs://<audioCid>",
    "standard": "sonata",
    "version": "1.0.0"
  }
}
```

At mint time, the contract takes `TokenMetadata` (`contracts/master-nft/src/metadata.rs`). Use the
song's `onChain` block:

| `TokenMetadata` field | Value                                                        |
| --------------------- | ------------------------------------------------------------ |
| `title`               | song title                                                   |
| `description`         | song description                                             |
| `media`               | `ipfs://<audioCid>` (the playable master)                    |
| `media_hash`          | `onChain.mediaHash` (base64 sha256 of the audio file)        |
| `reference`           | `ipfs://<metadataCid>` (the JSON above)                      |
| `reference_hash`      | `onChain.referenceHash` (base64 sha256 of the metadata JSON) |

Only the URIs and hashes go on-chain. Audio and artwork stay on IPFS. The app still uses
`/demo/audio/*.m4a` and `/demo/covers/*.webp` for the live demo; use `audioGatewayUrl` /
`coverGatewayUrl` if a browser needs IPFS media, because browsers cannot open `ipfs://` directly.

## 6. Troubleshooting

| Symptom                                                   | Fix                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `PINATA_JWT is not set`                                   | Add it to `.env.local` or pass it inline. Dry-run needs no JWT.                 |
| `PINATA_JWT does not look like a JWT`                     | Copy the full JWT from the Pinata API Keys page; drop a `Bearer ` prefix.       |
| `PINATA_JWT expired`                                      | Create a new key in Pinata and update `.env.local`.                             |
| `Pinata rejected PINATA_JWT (HTTP 401/403)`               | The key lacks pinning scope or was revoked. Create a scoped key.                |
| `Network error while pinning ...`                         | Check connectivity/DNS and re-run. Completed pins are saved, so resume is safe. |
| `Partial upload: N/12 songs are complete`                 | Fix the cause and re-run `--upload`; it resumes.                                |
| `manifest.ipfs.json is not a sonata-demo-ipfs@1 manifest` | Restore the file or delete it and re-upload.                                    |

The upload is about 19 MB of media plus twelve small JSON files. Check the Pinata plan's storage and
bandwidth limits before a large re-upload.
