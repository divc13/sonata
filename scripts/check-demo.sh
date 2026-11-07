#!/usr/bin/env bash
# Read-only status check for the Sonata testnet demo.
#
# Prints USDC, collection, master, listing, pass and song-account status. It
# uses NEAR JSON-RPC view calls directly (curl + python3) instead of
# near-cli-rs, so it never prompts, needs no signing key, and works in CI.
# No jq/npm dependency.
#
# Exit code: 0 when the chain demo is complete (12 masters, 5 active
# listings, an active listener pass and keyless song accounts), 1 otherwise.
# The platform/market sections are SKIP when those contracts are not
# deployed, but the missing demo state is still a FAIL.
#
# Usage:
#   scripts/check-demo.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../ops/testnet.env
source "$ROOT/ops/testnet.env"

NETWORK="${NEAR_NETWORK:-testnet}"
# rpc.testnet.near.org throttles bursts of view calls; point this at
# https://archival-rpc.testnet.fastnear.com/ when re-running in a loop.
RPC_URL="${SONATA_RPC_URL:-${NEAR_RPC_URL:-https://rpc.testnet.near.org}}"
WASM_DIR="$ROOT/contracts/target/wasm32-unknown-unknown/release"
CATALOGUE="$ROOT/scripts/demo-catalogue.json"

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
  body=$(curl -fsS --retry 5 --retry-delay 1 --retry-all-errors -X POST "$RPC_URL" \
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
  body=$(curl -fsS --retry 5 --retry-delay 1 --retry-all-errors -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-check\",\"method\":\"query\",\"params\":{\"request_type\":\"view_code\",\"finality\":\"final\",\"account_id\":\"$account\"}}") || return 1
  printf '%s' "$body" | grep -q '"code_base64":"[A-Za-z0-9+/]'
}

# `code_hash` and `global_contract_hash` of an account, tab separated. Exits 3
# when the account does not exist, 2 when the RPC itself could not answer.
account_code_state() {
  local account="$1" body
  body=$(curl -fsS --retry 5 --retry-delay 1 --retry-all-errors -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-check\",\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$account\"}}") || return 2
  printf '%s' "$body" | python3 -c '
import json, sys
response = json.load(sys.stdin)
if "error" in response:
    sys.exit(3)
result = response["result"]
print("\t".join([
    result.get("code_hash", ""),
    result.get("global_contract_hash", "") or "",
]))
'
}

# Number of access keys on an account. Same exit codes as account_code_state.
access_key_count() {
  local account="$1" body
  body=$(curl -fsS --retry 5 --retry-delay 1 --retry-all-errors -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-check\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$account\"}}") || return 2
  printf '%s' "$body" | python3 -c '
import json, sys
response = json.load(sys.stdin)
if "error" in response:
    sys.exit(3)
print(len(response["result"].get("keys", [])))
'
}

# Catalogue rows: token id, artist account, title, media path.
catalogue_songs_tsv() {
  python3 - "$CATALOGUE" <<'PY'
import json
import sys

for song in json.load(open(sys.argv[1]))["songs"]:
    print("\t".join([
        song["tokenId"],
        song["artistAccountId"],
        song["title"],
        song["media"],
    ]))
PY
}

# Compares the 12 expected masters with nft_tokens output. Emits PASS/FAIL/INFO
# lines for the shell to count.
check_masters_tsv() {
  python3 - "$CATALOGUE" "$MASTERS_ACCOUNT" "$1" <<'PY'
import json
import sys

catalogue = json.load(open(sys.argv[1]))
collection = sys.argv[2]
expected = {song["tokenId"]: song for song in catalogue["songs"]}
actual = json.loads(sys.argv[3])

if not isinstance(actual, list):
    print("FAIL\tnft_tokens did not return an array")
    sys.exit(0)

by_id = {}
for token in actual:
    token_id = token.get("token_id")
    if token_id in by_id:
        print(f"FAIL\tduplicate token {token_id}")
    by_id[token_id] = token

for token_id, song in expected.items():
    token = by_id.get(token_id)
    if token is None:
        print(f"FAIL\t{token_id} missing")
        continue

    owner = token.get("owner_id")
    creator = token.get("creator_id")
    sub_account = token.get("sub_account")
    metadata = token.get("metadata") or {}
    expected_sub = f"{token_id}.{collection}"

    problems = []
    if owner != song["artistAccountId"]:
        problems.append(f"owner {owner} != {song['artistAccountId']}")
    if creator != song["artistAccountId"]:
        problems.append(f"creator {creator} != {song['artistAccountId']}")
    if sub_account != expected_sub:
        problems.append(f"sub_account {sub_account} != {expected_sub}")
    if metadata.get("title") != song["title"]:
        problems.append(f"title {metadata.get('title')!r} != {song['title']!r}")
    if metadata.get("media") != song["media"]:
        problems.append(f"media {metadata.get('media')!r} != {song['media']!r}")
    if metadata.get("copies") != 1:
        problems.append(f"copies {metadata.get('copies')!r} != 1")

    if problems:
        print(f"FAIL\t{token_id}: {'; '.join(problems)}")
    else:
        print(f"PASS\t{token_id} owned by {owner}, sub-account {sub_account}")

for token_id in sorted(set(by_id) - set(expected)):
    print(f"FAIL\tunexpected token {token_id}")
PY
}

# Compares active market listings with the five expected resale entries.
check_listings_tsv() {
  python3 - "$CATALOGUE" "$1" <<'PY'
import json
import sys

catalogue = json.load(open(sys.argv[1]))
songs = {song["tokenId"]: song for song in catalogue["songs"]}
expected = {listing["tokenId"]: listing for listing in catalogue["listings"]}
actual = json.loads(sys.argv[2])

if not isinstance(actual, list):
    print("FAIL\tget_listings did not return an array")
    sys.exit(0)

active = {}
for item in actual:
    if not isinstance(item, list) or len(item) != 2:
        print(f"FAIL\tunexpected get_listings row: {item!r}")
        continue
    token_id, listing = item
    if listing.get("active"):
        active[token_id] = listing

print(f"INFO\tactive listings: {len(active)}")

for token_id, listing in expected.items():
    entry = active.get(token_id)
    if entry is None:
        print(f"FAIL\t{token_id} has no active listing")
        continue

    seller = entry.get("seller")
    price = entry.get("price")
    expected_seller = songs[token_id]["artistAccountId"]
    problems = []
    if seller != expected_seller:
        problems.append(f"seller {seller} != {expected_seller}")
    if str(price) != listing["price"]:
        problems.append(f"price {price} != {listing['price']}")

    if problems:
        print(f"FAIL\t{token_id}: {'; '.join(problems)}")
    else:
        print(f"PASS\t{token_id} listed by {seller} at {price} micro-USDC")

for token_id in sorted(set(active) - set(expected)):
    print(f"FAIL\tunexpected active listing {token_id}")
PY
}

global_code_exists() {
  local hash="$1" body
  body=$(curl -fsS --retry 5 --retry-delay 1 --retry-all-errors -X POST "$RPC_URL" \
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
  # The pass costs 5.00 USDC, so 15.00 is the post-purchase floor.
  check_balance "$LISTENER_ACCOUNT" 15000000
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
  info "token_supply: $supply"

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
else
  fail "no contract code at $MASTERS_ACCOUNT"
fi

# -------------------------------------------------------------- Masters ----
section "Masters  $MASTERS_ACCOUNT"
if account_has_code "$MASTERS_ACCOUNT"; then
  supply=$(call_view "$MASTERS_ACCOUNT" nft_total_supply | tr -d '"')
  assert_eq "nft_total_supply" "$supply" "12"

  if tokens=$(call_view "$MASTERS_ACCOUNT" nft_tokens '{"from_index":"0","limit":100}'); then
    while IFS=$'\t' read -r kind message; do
      case "$kind" in
        PASS) pass "$message" ;;
        FAIL) fail "$message" ;;
        INFO) info "$message" ;;
      esac
    done < <(check_masters_tsv "$tokens")
  else
    fail "nft_tokens view failed"
  fi
else
  fail "no contract code at $MASTERS_ACCOUNT"
fi

# -------------------------------------------------------- Song accounts ----
section "Song accounts"
if [ -n "${config_hash:-}" ]; then
  while IFS=$'\t' read -r token artist title media; do
    [ -n "$token" ] || continue
    sub="$token.$MASTERS_ACCOUNT"

    status=0
    state=$(account_code_state "$sub") || status=$?
    if [ "$status" -eq 3 ]; then
      fail "$sub does not exist"
      continue
    elif [ "$status" -ne 0 ]; then
      skip "$sub: RPC could not read the account"
      continue
    fi

    IFS=$'\t' read -r code_hash global_hash <<<"$state"
    if [ -n "$global_hash" ] && [ "$global_hash" = "$config_hash" ]; then
      pass "$sub uses the global song-wallet code"
    elif [ "$code_hash" = "$config_hash" ]; then
      pass "$sub code hash matches song-wallet"
    elif [ "$code_hash" = "11111111111111111111111111111111" ]; then
      fail "$sub has no code"
    else
      fail "$sub code hash ${global_hash:-$code_hash} != collection $config_hash"
    fi

    status=0
    keys=$(access_key_count "$sub") || status=$?
    if [ "$status" -eq 3 ]; then
      skip "$sub: access-key view not allowed by this RPC"
    elif [ "$status" -ne 0 ]; then
      skip "$sub: access-key view failed"
    else
      assert_eq "$sub access keys" "$keys" "0"
    fi
  done < <(catalogue_songs_tsv)
else
  skip "collection config unavailable; cannot verify song accounts"
fi

# ------------------------------------------------------------- Platform ----
section "Passes  $PLATFORM_ACCOUNT"
if account_has_code "$PLATFORM_ACCOUNT"; then
  pass "platform contract deployed"
  stats=$(call_view "$PLATFORM_ACCOUNT" get_stats)

  assert_eq "subscription_price" \
    "$(printf '%s' "$stats" | json_field subscription_price)" "5000000"
  assert_eq "rate_per_hour" \
    "$(printf '%s' "$stats" | json_field rate_per_hour)" "30000"
  assert_eq "reserve_target" \
    "$(printf '%s' "$stats" | json_field reserve_target)" "900000000"
  assert_eq "one_month_reserve" \
    "$(printf '%s' "$stats" | json_field one_month_reserve)" "300000000"
  assert_eq "oracle_id" \
    "$(printf '%s' "$stats" | json_field oracle_id)" "$ORACLE_ACCOUNT"
  info "balance: $(fmt_usdc "$(printf '%s' "$stats" | json_field balance)") USDC"

  listener_active=$(call_view "$PLATFORM_ACCOUNT" is_pass_active \
    "{\"account_id\":\"$LISTENER_ACCOUNT\"}" | tr -d '"')
  assert_eq "listener pass active" "$listener_active" "true"

  expiry=$(call_view "$PLATFORM_ACCOUNT" pass_expiry \
    "{\"account_id\":\"$LISTENER_ACCOUNT\"}" | tr -d '"')
  now=$(date +%s)
  if [ "${expiry:-0}" -gt "$now" ]; then
    pass "listener pass expiry: $expiry (now $now)"
  else
    fail "listener pass expiry: $expiry (now $now)"
  fi

  collector_active=$(call_view "$PLATFORM_ACCOUNT" is_pass_active \
    "{\"account_id\":\"$COLLECTOR_ACCOUNT\"}" | tr -d '"')
  info "collector pass active: $collector_active"
else
  skip "platform contract not deployed yet"
fi

# --------------------------------------------------------------- Market ----
section "Market  $MARKET_ACCOUNT"
if account_has_code "$MARKET_ACCOUNT"; then
  pass "market contract deployed"
  if listings=$(call_view "$MARKET_ACCOUNT" get_listings \
    '{"from_index":0,"limit":100}'); then
    while IFS=$'\t' read -r kind message; do
      case "$kind" in
        PASS) pass "$message" ;;
        FAIL) fail "$message" ;;
        INFO) info "$message" ;;
      esac
    done < <(check_listings_tsv "$listings")
  else
    fail "get_listings view failed"
  fi
else
  skip "market contract not deployed yet"
fi

# -------------------------------------------------------------- Summary ----
printf '\nSummary: %d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ]
