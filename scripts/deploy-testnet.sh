#!/usr/bin/env bash
# Deploy the Sonata core contracts to NEAR testnet.
#
# This is the repeatable, idempotent wrapper around
# contracts/scripts/deploy-core.sh. It sources ops/testnet.env, builds every
# wasm artifact, then deploys:
#
#   1. mock-usdc   -> $USDC_ACCOUNT     (owner $SONATA_PARENT)
#   2. song-wallet -> global, immutable (code hash recorded)
#   3. master-nft  -> $MASTERS_ACCOUNT  (owner $SONATA_PARENT)
#
# platform and market are skipped until their crates produce wasm; this
# script cannot guess their constructor wiring before the contracts exist.
#
# Usage:
#   scripts/deploy-testnet.sh                 # build + deploy core
#   scripts/deploy-testnet.sh --fund-demo     # also top up demo USDC balances
#
# Requirements: cargo + wasm32-unknown-unknown, near-cli-rs 0.30.x, python3.
# Signing uses the macOS keychain (sign-with-keychain) for every account.
#
# near-cli-rs 0.30.1 is interactive and expects a TTY, so every write goes
# through `script` when stdin is not a terminal (the macOS invocation).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../ops/testnet.env
source "$ROOT/ops/testnet.env"

WASM_DIR="$ROOT/contracts/target/wasm32-unknown-unknown/release"
NETWORK="${NEAR_NETWORK:-testnet}"
RPC_URL="${SONATA_RPC_URL:-${NEAR_RPC_URL:-https://rpc.testnet.fastnear.com}}"
SIGN_WITH="${SIGN_WITH:-sign-with-keychain}"
SIGNER="${SONATA_PARENT}"

# master-nft constructor values. Override with the environment if needed.
METADATA_NAME="${METADATA_NAME:-Sonata Masters}"
METADATA_SYMBOL="${METADATA_SYMBOL:-SONG}"
MINT_DEPOSIT="${MINT_DEPOSIT:-100000000000000000000000}" # 0.1 NEAR

FUND_DEMO=0
for arg in "$@"; do
  case "$arg" in
    --fund-demo) FUND_DEMO=1 ;;
    -h | --help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

# near-cli-rs 0.30.1 refuses to run without a TTY. macOS `script` supplies a
# pseudo-terminal; `yes ''` accepts the default choice of any prompt.
near_tty() {
  if [ -t 0 ] && [ -t 1 ]; then
    near "$@"
  elif [ "$(uname -s)" = "Darwin" ]; then
    yes '' | script -q /dev/null near "$@"
  else
    die "near-cli-rs needs a TTY here; run this script from a terminal (keychain signing is macOS-only)"
  fi
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

# Read-only JSON-RPC helper. It avoids near-cli-rs's interactive spinner and
# returns the decoded function result (JSON text).
rpc_view() {
  local account="$1" method="$2" args="${3:-'{}'}" args_b64 body
  args_b64=$(printf '%s' "$args" | base64 | tr -d '\n')
  body=$(curl -fsS -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-deploy\",\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$account\",\"method_name\":\"$method\",\"args_base64\":\"$args_b64\"}}")
  printf '%s' "$body" | python3 -c '
import base64, json, sys
response = json.load(sys.stdin)
if "error" in response:
    print(json.dumps(response["error"]), file=sys.stderr)
    sys.exit(2)
raw = response["result"]["result"]
data = base64.b64decode(raw) if isinstance(raw, str) else bytes(raw)
sys.stdout.write(data.decode())
'
}

json_field() {
  python3 -c '
import json, sys
value = json.load(sys.stdin)
for key in sys.argv[1:]:
    value = value[key]
print(value)
' "$@"
}

# True if the account has a contract deployed (view_code returns non-empty wasm).
account_has_code() {
  local account="$1" body
  body=$(curl -fsS -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-deploy\",\"method\":\"query\",\"params\":{\"request_type\":\"view_code\",\"finality\":\"final\",\"account_id\":\"$account\"}}") || return 1
  printf '%s' "$body" | grep -q '"code_base64":"[A-Za-z0-9+/]'
}

# True if an immutable global contract with this base58 hash exists.
global_code_exists() {
  local hash="$1" body
  body=$(curl -fsS -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-deploy\",\"method\":\"query\",\"params\":{\"request_type\":\"view_global_contract_code\",\"finality\":\"final\",\"code_hash\":\"$hash\"}}") || return 1
  printf '%s' "$body" | grep -q '"code_base64":"[A-Za-z0-9+/]'
}

build_wasm() {
  say "Building workspace wasm (release)"
  cargo build \
    --manifest-path "$ROOT/contracts/Cargo.toml" \
    --workspace \
    --target wasm32-unknown-unknown \
    --release

  local wasm
  for wasm in mock_usdc.wasm song_wallet.wasm master_nft.wasm; do
    [ -f "$WASM_DIR/$wasm" ] || die "missing build artifact: $WASM_DIR/$wasm"
  done
}

deploy_usdc() {
  if account_has_code "$USDC_ACCOUNT"; then
    say "mock-usdc already deployed at $USDC_ACCOUNT (skipping)"
    return
  fi

  say "Deploying mock-usdc to $USDC_ACCOUNT (owner $SONATA_PARENT)"
  near_tty contract deploy "$USDC_ACCOUNT" \
    use-file "$WASM_DIR/mock_usdc.wasm" \
    with-init-call new json-args "{\"owner_id\":\"$SONATA_PARENT\"}" \
    prepaid-gas 30Tgas \
    attached-deposit 0NEAR \
    network-config "$NETWORK" \
    "$SIGN_WITH" send
}

deploy_song_wallet() {
  SONG_WALLET_CODE_HASH="$(sha256_base58 "$WASM_DIR/song_wallet.wasm")"
  say "song-wallet code hash: $SONG_WALLET_CODE_HASH"

  if global_code_exists "$SONG_WALLET_CODE_HASH"; then
    say "Global song-wallet already deployed (skipping)"
    return
  fi

  say "Deploying song-wallet as an immutable global contract (stores ~25 NEAR of code)"
  near_tty contract deploy-as-global \
    use-file "$WASM_DIR/song_wallet.wasm" \
    as-global-hash "$SIGNER" \
    network-config "$NETWORK" \
    "$SIGN_WITH" send
}

deploy_master() {
  if account_has_code "$MASTERS_ACCOUNT"; then
    say "master-nft already deployed at $MASTERS_ACCOUNT (skipping)"
    return
  fi

  local metadata master_args
  metadata=$(python3 - "$METADATA_NAME" "$METADATA_SYMBOL" <<'PY'
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
  master_args=$(python3 - \
    "$SONATA_PARENT" "$metadata" "$PLATFORM_ACCOUNT" "$USDC_ACCOUNT" \
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

  say "Deploying master-nft to $MASTERS_ACCOUNT"
  near_tty contract deploy "$MASTERS_ACCOUNT" \
    use-file "$WASM_DIR/master_nft.wasm" \
    with-init-call new json-args "$master_args" \
    prepaid-gas 100Tgas \
    attached-deposit 0NEAR \
    network-config "$NETWORK" \
    "$SIGN_WITH" send
}

# platform/market are not part of the core cargo workspace yet. When their
# wasm appears, add a deploy function with explicit constructor arguments here;
# do not guess the wiring.
deploy_optional() {
  local name="$1" account="$2" wasm="$3"
  if [ -f "$WASM_DIR/$wasm" ]; then
    say "$name wasm found at $WASM_DIR/$wasm"
    die "$name deployment is not wired in this script yet; deploy $account manually (see ops/testnet.md)"
  fi
  say "$name not deployed: $WASM_DIR/$wasm does not exist yet (contract not built). Skipping $account."
}

verify_core() {
  say "Verifying core contracts (read-only)"

  local metadata decimals symbol config owner platform payment config_hash
  metadata=$(rpc_view "$USDC_ACCOUNT" ft_metadata)
  decimals=$(printf '%s' "$metadata" | json_field decimals)
  symbol=$(printf '%s' "$metadata" | json_field symbol)
  [ "$decimals" = "6" ] || die "USDC decimals is $decimals, expected 6"
  [ "$symbol" = "USDC" ] || die "USDC symbol is $symbol, expected USDC"
  printf 'USDC %s: %s decimals, total supply %s\n' \
    "$USDC_ACCOUNT" "$decimals" "$(rpc_view "$USDC_ACCOUNT" ft_total_supply | tr -d '"')"

  config=$(rpc_view "$MASTERS_ACCOUNT" get_config)
  owner=$(printf '%s' "$config" | json_field owner_id)
  platform=$(printf '%s' "$config" | json_field platform_id)
  payment=$(printf '%s' "$config" | json_field payment_token)
  config_hash=$(printf '%s' "$config" | json_field song_wallet_code_hash)
  [ "$owner" = "$SONATA_PARENT" ] || die "master owner is $owner, expected $SONATA_PARENT"
  [ "$platform" = "$PLATFORM_ACCOUNT" ] || die "master platform is $platform, expected $PLATFORM_ACCOUNT"
  [ "$payment" = "$USDC_ACCOUNT" ] || die "master payment token is $payment, expected $USDC_ACCOUNT"
  [ "$config_hash" = "$SONG_WALLET_CODE_HASH" ] ||
    die "master code hash is $config_hash, expected $SONG_WALLET_CODE_HASH (call set_song_wallet_code_hash)"
  global_code_exists "$config_hash" || die "global song-wallet code $config_hash is missing"

  printf 'master-nft %s:\n%s\n' "$MASTERS_ACCOUNT" "$config"
  printf 'global song-wallet code hash: %s (verified)\n' "$config_hash"
}

fund_demo() {
  say "Registering demo accounts on USDC"
  # All five demo people must exist in the token's storage before any transfer
  # can reach them. `mint` auto-registers its recipient, but the artists are
  # never minted to, so register every account explicitly (idempotent: the
  # contract refunds the deposit when the account is already registered).
  register_account "$LISTENER_ACCOUNT"
  register_account "$COLLECTOR_ACCOUNT"
  register_account "$NADIA_ACCOUNT"
  register_account "$KOFI_ACCOUNT"
  register_account "$LENA_ACCOUNT"

  say "Funding demo USDC balances"

  # target balances in micro-USDC (6 decimals)
  fund_account "$LISTENER_ACCOUNT" 20000000
  fund_account "$COLLECTOR_ACCOUNT" 200000000
  fund_account "$PLATFORM_ACCOUNT" 1000000000
}

# True when the account already has a USDC storage balance (`null` when not
# registered).
usdc_registered() {
  local account="$1" balance
  balance=$(rpc_view "$USDC_ACCOUNT" storage_balance_of "{\"account_id\":\"$account\"}")
  [ -n "$balance" ] && [ "$balance" != "null" ]
}

# Register an account for USDC storage, refunding the excess deposit on a
# second run. 0.01 NEAR covers the fixed per-account cost.
register_account() {
  local account="$1"
  if usdc_registered "$account"; then
    say "$account is already registered on $USDC_ACCOUNT (skipping)"
    return
  fi
  say "Registering $account on $USDC_ACCOUNT"
  near_tty contract call-function as-transaction "$USDC_ACCOUNT" storage_deposit \
    json-args "{\"account_id\":\"$account\",\"registration_only\":true}" \
    prepaid-gas 30Tgas \
    attached-deposit 0.01NEAR \
    sign-as "$SONATA_PARENT" \
    network-config "$NETWORK" \
    "$SIGN_WITH" send
}

fund_account() {
  local account="$1" target="$2" current delta
  current=$(rpc_view "$USDC_ACCOUNT" ft_balance_of "{\"account_id\":\"$account\"}" | tr -d '"')
  current="${current:-0}"
  if [ "$current" -ge "$target" ]; then
    say "$account already has $current micro-USDC (target $target), skipping"
    return
  fi
  delta=$((target - current))
  say "Minting $delta micro-USDC to $account (target $target)"
  near_tty contract call-function as-transaction "$USDC_ACCOUNT" mint \
    json-args "{\"account_id\":\"$account\",\"amount\":\"$delta\"}" \
    prepaid-gas 30Tgas \
    attached-deposit 0NEAR \
    sign-as "$SONATA_PARENT" \
    network-config "$NETWORK" \
    "$SIGN_WITH" send
}

command -v near >/dev/null || die "near-cli-rs ('near') is required"
command -v cargo >/dev/null || die "cargo is required"
command -v python3 >/dev/null || die "python3 is required"
command -v curl >/dev/null || die "curl is required"

build_wasm
deploy_usdc
deploy_song_wallet
deploy_master
deploy_optional "platform" "$PLATFORM_ACCOUNT" "platform.wasm"
deploy_optional "market" "$MARKET_ACCOUNT" "market.wasm"
verify_core

if [ "$FUND_DEMO" -eq 1 ]; then
  fund_demo
fi

say "Done"
cat <<EOF
network:          $NETWORK
mock-usdc:        $USDC_ACCOUNT (owner $SONATA_PARENT)
song-wallet hash: $SONG_WALLET_CODE_HASH (global, immutable)
master-nft:       $MASTERS_ACCOUNT
platform:         $PLATFORM_ACCOUNT (not deployed)
market:           $MARKET_ACCOUNT (not deployed)
mint deposit:     $MINT_DEPOSIT yoctoNEAR
EOF
