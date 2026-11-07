#!/usr/bin/env bash
# Deploy the Sonata core contracts: mock-usdc, song-wallet (as a global
# contract) and master-nft.
#
# No keys live in this repository. Authenticate near-cli-rs before running,
# e.g. `near login` or `near account import-account`, or set SIGN_WITH to a
# signer subcommand that fits your setup.
#
# Required environment:
#   MASTER_ACCOUNT    account that will own the master NFT collection
#   PLATFORM_ACCOUNT  platform contract that registers song wallets
#
# Optional environment:
#   SIGNER_ACCOUNT    signer for every transaction (default: MASTER_ACCOUNT)
#   USDC_ACCOUNT      mock USDC account (default: usdc.<MASTER_ACCOUNT>)
#   USDC_OWNER        owner allowed to mint demo USDC (default: SIGNER_ACCOUNT)
#   NEAR_NETWORK      testnet | mainnet | localnet (default: testnet)
#   SIGN_WITH         near-cli-rs signer subcommand (default: sign-with-keychain)
#   MINT_DEPOSIT      nft_mint deposit in yoctoNEAR (default: 0.1 NEAR)
#   METADATA_NAME     collection name (default: "Sonata Masters")
#   METADATA_SYMBOL   collection symbol (default: "SONG")
#
# The target accounts must already exist and the signer must hold a full
# access key for them.
#
# Usage:
#   MASTER_ACCOUNT=masters.sonata.testnet \
#   PLATFORM_ACCOUNT=platform.sonata.testnet \
#   ./scripts/deploy-core.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_DIR="$ROOT/target/wasm32-unknown-unknown/release"

NETWORK="${NEAR_NETWORK:-testnet}"
MASTER_ACCOUNT="${MASTER_ACCOUNT:?set MASTER_ACCOUNT}"
PLATFORM_ACCOUNT="${PLATFORM_ACCOUNT:?set PLATFORM_ACCOUNT}"
SIGNER_ACCOUNT="${SIGNER_ACCOUNT:-$MASTER_ACCOUNT}"
USDC_ACCOUNT="${USDC_ACCOUNT:-usdc.$MASTER_ACCOUNT}"
USDC_OWNER="${USDC_OWNER:-$SIGNER_ACCOUNT}"
MINT_DEPOSIT="${MINT_DEPOSIT:-100000000000000000000000}" # 0.1 NEAR
METADATA_NAME="${METADATA_NAME:-Sonata Masters}"
METADATA_SYMBOL="${METADATA_SYMBOL:-SONG}"
SIGN_WITH="${SIGN_WITH:-sign-with-keychain}"

say() { printf '\n==> %s\n' "$*"; }

command -v near >/dev/null || {
  echo "near-cli-rs ('near') is required: https://github.com/near/near-cli-rs" >&2
  exit 1
}
command -v cargo >/dev/null || {
  echo "cargo is required" >&2
  exit 1
}
command -v python3 >/dev/null || {
  echo "python3 is required to derive the global code hash" >&2
  exit 1
}

# base58(sha256(wasm)): the identifier of an immutable global contract.
sha256_base58() {
  python3 - "$1" <<'PY'
import hashlib
import sys

alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
digest = hashlib.sha256(open(sys.argv[1], "rb").read()).digest()
number = int.from_bytes(digest, "big")
encoded = ""
while number:
    number, remainder = divmod(number, 58)
    encoded = alphabet[remainder] + encoded
for byte in digest:
    if byte:
        break
    encoded = "1" + encoded
print(encoded)
PY
}

say "Building contracts (release)"
cargo build \
  --manifest-path "$ROOT/Cargo.toml" \
  --workspace \
  --target wasm32-unknown-unknown \
  --release

for wasm in mock_usdc.wasm song_wallet.wasm master_nft.wasm; do
  test -f "$WASM_DIR/$wasm" || {
    echo "missing build artifact: $WASM_DIR/$wasm" >&2
    exit 1
  }
done

say "Deploying mock-usdc to $USDC_ACCOUNT"
near contract deploy "$USDC_ACCOUNT" \
  use-file "$WASM_DIR/mock_usdc.wasm" \
  with-init-call new json-args "{\"owner_id\":\"$USDC_OWNER\"}" \
  prepaid-gas 30Tgas \
  attached-deposit 0NEAR \
  network-config "$NETWORK" \
  "$SIGN_WITH" send

say "Deploying song-wallet as an immutable global contract"
near contract deploy-as-global \
  use-file "$WASM_DIR/song_wallet.wasm" \
  as-global-hash "$SIGNER_ACCOUNT" \
  network-config "$NETWORK" \
  "$SIGN_WITH" send

SONG_WALLET_CODE_HASH="$(sha256_base58 "$WASM_DIR/song_wallet.wasm")"
say "song-wallet global code hash: $SONG_WALLET_CODE_HASH"

say "Deploying master-nft to $MASTER_ACCOUNT"
MASTER_METADATA=$(python3 - "$METADATA_NAME" "$METADATA_SYMBOL" <<'PY'
import json
import sys

print(json.dumps({
    "spec": "nft-1.0.0",
    "name": sys.argv[1],
    "symbol": sys.argv[2],
    "icon": None,
    "base_uri": None,
    "reference": None,
    "reference_hash": None,
}))
PY
)
MASTER_ARGS=$(python3 - \
  "$MASTER_ACCOUNT" "$MASTER_METADATA" "$PLATFORM_ACCOUNT" "$USDC_ACCOUNT" \
  "$SONG_WALLET_CODE_HASH" "$MINT_DEPOSIT" <<'PY'
import json
import sys

owner, metadata, platform, payment_token, code_hash, mint_deposit = sys.argv[1:]
print(json.dumps({
    "owner_id": owner,
    "metadata": json.loads(metadata),
    "platform_id": platform,
    "payment_token": payment_token,
    "song_wallet_code_hash": code_hash,
    "mint_deposit": mint_deposit,
}))
PY
)
near contract deploy "$MASTER_ACCOUNT" \
  use-file "$WASM_DIR/master_nft.wasm" \
  with-init-call new json-args "$MASTER_ARGS" \
  prepaid-gas 100Tgas \
  attached-deposit 0NEAR \
  network-config "$NETWORK" \
  "$SIGN_WITH" send

say "Deployed"
cat <<EOF
network:            $NETWORK
mock-usdc:          $USDC_ACCOUNT (owner $USDC_OWNER)
song-wallet hash:   $SONG_WALLET_CODE_HASH (global, immutable)
master-nft:         $MASTER_ACCOUNT
platform:           $PLATFORM_ACCOUNT
payment token:      $USDC_ACCOUNT
mint deposit:       $MINT_DEPOSIT yoctoNEAR

The master collection must be funded with enough NEAR to pay for the
storage of each mint (metadata, owner set, approvals). The platform
contract is not deployed by this script; deploy it separately and make
sure its register_song call is registered on $USDC_ACCOUNT.
EOF
