#!/usr/bin/env bash
# Read-only status check for the Sonata testnet demo.
#
# Prints USDC, master collection and platform-pass status. It uses NEAR
# JSON-RPC view calls directly (curl + python3) instead of near-cli-rs, so it
# never prompts, needs no signing key, and works in CI. No jq/npm dependency.
#
# Exit code: 0 when every required core check passes, 1 otherwise. A contract
# that has not been built/deployed yet (platform, market) is reported as SKIP,
# not as a failure.
#
# Usage:
#   scripts/check-demo.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../ops/testnet.env
source "$ROOT/ops/testnet.env"

NETWORK="${NEAR_NETWORK:-testnet}"
RPC_URL="${NEAR_RPC_URL:-https://rpc.testnet.near.org}"
WASM_DIR="$ROOT/contracts/target/wasm32-unknown-unknown/release"

PASS=0
FAIL=0
SKIP=0

section() { printf '\n%s\n' "$*"; }
pass() {
  PASS=$((PASS + 1))
  printf '  [PASS] %s\n' "$*"
}
fail() {
  FAIL=$((FAIL + 1))
  printf '  [FAIL] %s\n' "$*"
}
info() { printf '  [INFO] %s\n' "$*"; }
skip() {
  SKIP=$((SKIP + 1))
  printf '  [SKIP] %s\n' "$*"
}

assert_eq() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$label: $actual"
  else
    fail "$label: got '$actual', expected '$expected'"
  fi
}

call_view() {
  local account="$1" method="$2" args="${3:-'{}'}" args_b64 body
  args_b64=$(printf '%s' "$args" | base64 | tr -d '\n')
  body=$(curl -fsS -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-check\",\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$account\",\"method_name\":\"$method\",\"args_base64\":\"$args_b64\"}}")
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

account_has_code() {
  local account="$1" body
  body=$(curl -fsS -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-check\",\"method\":\"query\",\"params\":{\"request_type\":\"view_code\",\"finality\":\"final\",\"account_id\":\"$account\"}}") || return 1
  printf '%s' "$body" | grep -q '"code_base64":"[A-Za-z0-9+/]'
}

global_code_exists() {
  local hash="$1" body
  body=$(curl -fsS -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-check\",\"method\":\"query\",\"params\":{\"request_type\":\"view_global_contract_code\",\"finality\":\"final\",\"code_hash\":\"$hash\"}}") || return 1
  printf '%s' "$body" | grep -q '"code_base64":"[A-Za-z0-9+/]'
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

fmt_usdc() {
  local micro="${1:-0}"
  printf '%d.%06d' $((micro / 1000000)) $((micro % 1000000))
}

check_balance() {
  local account="$1" target="$2" balance
  balance=$(call_view "$USDC_ACCOUNT" ft_balance_of "{\"account_id\":\"$account\"}" | tr -d '"')
  if [ "${balance:-0}" -ge "$target" ]; then
    pass "$account: $(fmt_usdc "$balance") USDC (target $(fmt_usdc "$target"))"
  else
    fail "$account: $(fmt_usdc "${balance:-0}") USDC, target $(fmt_usdc "$target")"
  fi
}

command -v curl >/dev/null || {
  echo "curl is required" >&2
  exit 1
}
command -v python3 >/dev/null || {
  echo "python3 is required" >&2
  exit 1
}

printf 'Sonata testnet demo check\n'
printf 'network: %s\nrpc:     %s\n' "$NETWORK" "$RPC_URL"

# ---------------------------------------------------------------- USDC ----
section "USDC  $USDC_ACCOUNT"
if account_has_code "$USDC_ACCOUNT"; then
  pass "contract deployed"
  metadata=$(call_view "$USDC_ACCOUNT" ft_metadata)
  symbol=$(printf '%s' "$metadata" | json_field symbol)
  decimals=$(printf '%s' "$metadata" | json_field decimals)
  total=$(call_view "$USDC_ACCOUNT" ft_total_supply | tr -d '"')
  assert_eq "symbol" "$symbol" "USDC"
  assert_eq "decimals" "$decimals" "6"
  info "total supply: $(fmt_usdc "$total") USDC ($total micro-USDC)"
  check_balance "$LISTENER_ACCOUNT" 20000000
  check_balance "$COLLECTOR_ACCOUNT" 200000000
  check_balance "$PLATFORM_ACCOUNT" 1000000000
else
  fail "no contract code at $USDC_ACCOUNT"
fi

# ---------------------------------------------------------- Collection ----
section "Collection  $MASTERS_ACCOUNT"
COLLECTION_CODE_HASH=""
if account_has_code "$MASTERS_ACCOUNT"; then
  pass "contract deployed"
  config=$(call_view "$MASTERS_ACCOUNT" get_config)
  owner=$(printf '%s' "$config" | json_field owner_id)
  platform=$(printf '%s' "$config" | json_field platform_id)
  payment=$(printf '%s' "$config" | json_field payment_token)
  config_hash=$(printf '%s' "$config" | json_field song_wallet_code_hash)
  supply=$(printf '%s' "$config" | json_field token_supply)
  mint_deposit=$(printf '%s' "$config" | json_field mint_deposit)

  assert_eq "owner_id" "$owner" "$SONATA_PARENT"
  assert_eq "platform_id" "$platform" "$PLATFORM_ACCOUNT"
  assert_eq "payment_token" "$payment" "$USDC_ACCOUNT"
  assert_eq "royalty_bps" "$(printf '%s' "$config" | json_field royalty_bps)" "500"
  info "mint_deposit: $mint_deposit yoctoNEAR"
  info "token_supply: $supply (minting waits for platform.register_song)"

  if global_code_exists "$config_hash"; then
    pass "song-wallet global code present: $config_hash"
  else
    fail "song-wallet global code missing: $config_hash"
  fi

  if [ -f "$WASM_DIR/song_wallet.wasm" ]; then
    local_hash=$(sha256_base58 "$WASM_DIR/song_wallet.wasm")
    assert_eq "song-wallet hash matches local wasm" "$config_hash" "$local_hash"
  else
    skip "local song-wallet wasm not built; run cargo build --workspace --target wasm32-unknown-unknown --release"
  fi

  nft_metadata=$(call_view "$MASTERS_ACCOUNT" nft_metadata)
  assert_eq "nft name" "$(printf '%s' "$nft_metadata" | json_field name)" "Sonata Masters"
  assert_eq "nft symbol" "$(printf '%s' "$nft_metadata" | json_field symbol)" "SONG"
  assert_eq "nft_total_supply" "$(call_view "$MASTERS_ACCOUNT" nft_total_supply | tr -d '"')" "0"
else
  fail "no contract code at $MASTERS_ACCOUNT"
fi

# ------------------------------------------------------------- Platform ----
section "Passes  $PLATFORM_ACCOUNT"
if account_has_code "$PLATFORM_ACCOUNT"; then
  pass "platform contract deployed"
  stats=$(call_view "$PLATFORM_ACCOUNT" get_stats)
  info "subscription price: $(fmt_usdc "$(printf '%s' "$stats" | json_field subscription_price)") USDC"
  info "rate per hour:      $(fmt_usdc "$(printf '%s' "$stats" | json_field rate_per_hour)") USDC"
  for account in "$LISTENER_ACCOUNT" "$COLLECTOR_ACCOUNT"; do
    active=$(call_view "$PLATFORM_ACCOUNT" is_pass_active "{\"account_id\":\"$account\"}" | tr -d '"')
    expiry=$(call_view "$PLATFORM_ACCOUNT" pass_expiry "{\"account_id\":\"$account\"}" | tr -d '"')
    info "$account: active=$active expiry=$expiry"
  done
else
  skip "platform contract not deployed yet (contracts/platform wasm does not exist)"
fi

# --------------------------------------------------------------- Market ----
section "Market  $MARKET_ACCOUNT"
if account_has_code "$MARKET_ACCOUNT"; then
  pass "market contract deployed"
else
  skip "market contract not deployed yet (contracts/market wasm does not exist)"
fi

# -------------------------------------------------------------- Summary ----
printf '\nSummary: %d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ]
