#!/usr/bin/env bash
# Mint and list the Sonata demo catalogue on testnet, then buy the listener pass.
#
# This is the chain half of specs/06-demo.md. It is idempotent and safe to
# re-run: existing masters are skipped by `nft_token`, existing approvals and
# listings are checked before writing, and an active pass is left alone.
#
#   scripts/mint-demo.sh
#
# Prerequisites:
#   - platform-sonata.testnet and market-sonata.testnet have contract code
#     (run scripts/deploy-platform-market.sh first)
#   - the artist/listener keys are in the macOS keychain
#   - USDC is funded for listener.sonata.testnet ($5.00 for the pass)
#
# Catalogue metadata (titles, descriptions, media paths, prices) lives in
# scripts/demo-catalogue.json and is pinned to packages/db/src/sonata-seed.ts
# by scripts/__tests__/demo-catalogue.test.ts.
#
# Writes are wrapped in `script` because near-cli-rs 0.30.1 expects a TTY.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../ops/testnet.env
source "$ROOT/ops/testnet.env"

CATALOGUE="$ROOT/scripts/demo-catalogue.json"
NETWORK="${NEAR_NETWORK:-testnet}"
RPC_URL="${SONATA_RPC_URL:-${NEAR_RPC_URL:-https://rpc.testnet.fastnear.com}}"
SIGN_WITH="${SIGN_WITH:-sign-with-keychain}"

MINT_DEPOSIT="${MINT_DEPOSIT:-0.1NEAR}"
MINT_GAS="${MINT_GAS:-300Tgas}"
APPROVAL_DEPOSIT="${APPROVAL_DEPOSIT:-0.01NEAR}"
LISTING_DEPOSIT="${LISTING_DEPOSIT:-0.01NEAR}"
PASS_PRICE="${PASS_PRICE:-5000000}"
WAIT_TRIES="${WAIT_TRIES:-45}"

say() { printf '\n==> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

TX_DIR=""
cleanup() { [ -n "$TX_DIR" ] && rm -rf "$TX_DIR"; }
trap cleanup EXIT
TX_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sonata-mint-demo.XXXXXX")"

run_tx() {
  local label="$1"
  shift
  local log="$TX_DIR/$label.log" tx status=0
  if [ -t 0 ] && [ -t 1 ]; then
    "$@" 2>&1 | tee "$log" || status=$?
  elif [ "$(uname -s)" = "Darwin" ]; then
    # macOS `script` exits non-zero with "write master: Input/output error"
    # once the child closes the pseudo-terminal, even when the transaction
    # succeeded. Trust the printed transaction id, not the wrapper status.
    yes '' | script -q /dev/null "$@" 2>&1 | tee "$log" || status=$?
  else
    die "near-cli-rs needs a TTY here; run from a terminal (keychain signing is macOS-only)"
  fi
  tx="$(tx_id_from_log "$log")"
  if [ -n "$tx" ]; then
    printf '    transaction: %s\n' "$tx"
  elif [ "$status" -ne 0 ]; then
    printf 'error: near exited %s without a transaction id\n' "$status" >&2
    return 1
  else
    printf '    (no transaction id parsed; see the command output above)\n'
  fi
}

tx_id_from_log() {
  python3 - "$1" <<'PY'
import re
import sys

text = open(sys.argv[1], errors="replace").read()
text = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)
match = re.search(r"Transaction [Ii][Dd]:\s*([1-9A-HJ-NP-Za-km-z]{32,})", text)
print(match.group(1) if match else "")
PY
}

rpc_view() {
  local account="$1" method="$2" args="${3:-'{}'}" args_b64 body
  args_b64=$(printf '%s' "$args" | base64 | tr -d '\n')
  body=$(curl -fsS --retry 5 --retry-delay 1 --retry-all-errors -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-mint-demo\",\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$account\",\"method_name\":\"$method\",\"args_base64\":\"$args_b64\"}}")
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

# 0 = contract code present, 1 = no code, 2 = the RPC could not answer.
account_has_code() {
  local account="$1" body
  body=$(curl -fsS --retry 5 --retry-delay 1 --retry-all-errors -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-mint-demo\",\"method\":\"query\",\"params\":{\"request_type\":\"view_code\",\"finality\":\"final\",\"account_id\":\"$account\"}}") || return 2
  printf '%s' "$body" | grep -q '"code_base64":"[A-Za-z0-9+/]'
}

account_exists() {
  local account="$1" body
  body=$(curl -fsS --retry 5 --retry-delay 1 --retry-all-errors -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-mint-demo\",\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$account\"}}") || return 1
  ! printf '%s' "$body" | grep -q '"error"'
}

get_token() {
  rpc_view "$MASTERS_ACCOUNT" nft_token "{\"token_id\":\"$1\"}"
}

listing_state() {
  printf '%s' "$1" | python3 -c '
import json, sys
value = json.load(sys.stdin)
if value is None:
    print("")
else:
    print("\t".join([
        str(value.get("active", "")).lower(),
        str(value.get("seller", "")),
        str(value.get("price", "")),
    ]))
'
}

catalogue_songs() {
  python3 - "$CATALOGUE" <<'PY'
import json
import sys

for song in json.load(open(sys.argv[1]))["songs"]:
    print("\t".join([
        song["tokenId"],
        song["title"],
        song["artistAccountId"],
        song["description"],
        song["media"],
    ]))
PY
}

catalogue_listings() {
  python3 - "$CATALOGUE" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1]))
songs = {song["tokenId"]: song for song in data["songs"]}
for listing in data["listings"]:
    print("\t".join([
        listing["tokenId"],
        listing["price"],
        songs[listing["tokenId"]]["artistAccountId"],
    ]))
PY
}

wait_for_token() {
  local token="$1" expected_owner="$2" i json owner
  for ((i = 0; i < WAIT_TRIES; i++)); do
    json=$(get_token "$token")
    if [ "$json" != "null" ]; then
      owner=$(printf '%s' "$json" | json_field owner_id)
      [ "$owner" = "$expected_owner" ] && return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_song_registered() {
  local token="$1" sub="$1.$MASTERS_ACCOUNT" i balance
  for ((i = 0; i < WAIT_TRIES; i++)); do
    if account_exists "$sub"; then
      balance=$(rpc_view "$USDC_ACCOUNT" storage_balance_of "{\"account_id\":\"$sub\"}")
      [ "$balance" != "null" ] && return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_listing() {
  local token="$1" expected_seller="$2" expected_price="$3" i state active seller price
  for ((i = 0; i < WAIT_TRIES; i++)); do
    state=$(listing_state "$(rpc_view "$MARKET_ACCOUNT" get_listing "{\"token_id\":\"$token\"}")")
    if [ -n "$state" ]; then
      IFS=$'\t' read -r active seller price <<<"$state"
      if [ "$active" = "true" ] && [ "$seller" = "$expected_seller" ] && [ "$price" = "$expected_price" ]; then
        return 0
      fi
    fi
    sleep 1
  done
  return 1
}

wait_for_pass() {
  local i active
  for ((i = 0; i < WAIT_TRIES; i++)); do
    active=$(rpc_view "$PLATFORM_ACCOUNT" is_pass_active "{\"account_id\":\"$LISTENER_ACCOUNT\"}")
    [ "$active" = "true" ] && return 0
    sleep 1
  done
  return 1
}

require_deployed() {
  local pair account name status
  for pair in "$PLATFORM_ACCOUNT:platform" "$MARKET_ACCOUNT:market" \
    "$MASTERS_ACCOUNT:master-nft" "$USDC_ACCOUNT:mock-usdc"; do
    account="${pair%%:*}"
    name="${pair#*:}"
    status=0
    account_has_code "$account" || status=$?
    if [ "$status" -eq 2 ]; then
      die "RPC could not read $account; refusing to guess whether $name is deployed"
    fi
    if [ "$status" -ne 0 ]; then
      die "$name is not deployed at $account; run scripts/deploy-platform-market.sh first"
    fi
  done

  local config platform payment mint_deposit
  config=$(rpc_view "$MASTERS_ACCOUNT" get_config)
  platform=$(printf '%s' "$config" | json_field platform_id)
  payment=$(printf '%s' "$config" | json_field payment_token)
  mint_deposit=$(printf '%s' "$config" | json_field mint_deposit)
  [ "$platform" = "$PLATFORM_ACCOUNT" ] ||
    die "master-nft.platform_id is $platform, expected $PLATFORM_ACCOUNT"
  [ "$payment" = "$USDC_ACCOUNT" ] ||
    die "master-nft.payment_token is $payment, expected $USDC_ACCOUNT"
  if [ "$mint_deposit" != "100000000000000000000000" ]; then
    warn "master-nft.mint_deposit is $mint_deposit yoctoNEAR, expected 0.1 NEAR (100000000000000000000000)"
  fi
}

mint_songs() {
  local token title artist description media existing owner args
  while IFS=$'\t' read -r token title artist description media; do
    [ -n "$token" ] || continue

    existing=$(get_token "$token")
    if [ "$existing" != "null" ]; then
      owner=$(printf '%s' "$existing" | json_field owner_id)
      if [ "$owner" = "$artist" ]; then
        say "$token already minted for $artist (skipping)"
      else
        warn "$token already exists and is owned by $owner, not $artist; leaving it alone"
      fi
      continue
    fi

    say "Minting $token for $artist"
    args=$(python3 - "$token" "$title" "$artist" "$description" "$media" <<'PY'
import json
import sys

token, title, artist, description, media = sys.argv[1:]
print(json.dumps({
    "token_id": token,
    "metadata": {
        "title": title,
        "description": description,
        "media": media,
        "media_hash": None,
        "copies": 1,
        "issued_at": None,
        "expires_at": None,
        "starts_at": None,
        "updated_at": None,
        "extra": None,
        "reference": None,
        "reference_hash": None,
    },
    "receiver_id": artist,
}))
PY
)
    run_tx "mint-$token" near contract call-function as-transaction "$MASTERS_ACCOUNT" nft_mint \
      json-args "$args" \
      prepaid-gas "$MINT_GAS" \
      attached-deposit "$MINT_DEPOSIT" \
      sign-as "$artist" \
      network-config "$NETWORK" \
      "$SIGN_WITH" send || die "mint transaction for $token failed; see the output above"

    wait_for_token "$token" "$artist" ||
      die "mint of $token did not appear under $artist; inspect the transaction above"
    if ! wait_for_song_registered "$token"; then
      die "master $token exists but $token.$MASTERS_ACCOUNT was not registered on $USDC_ACCOUNT; do NOT re-mint, inspect platform.register_song"
    fi
  done < <(catalogue_songs)
}

ensure_listing() {
  local token="$1" price="$2" artist="$3"
  local token_json owner approved listing state active seller listing_price

  token_json=$(get_token "$token")
  if [ "$token_json" = "null" ]; then
    die "cannot list $token: nft_token returned null"
  fi
  owner=$(printf '%s' "$token_json" | json_field owner_id)
  if [ "$owner" != "$artist" ]; then
    warn "$token is owned by $owner, not $artist; skipping the listing (already sold?)"
    return 0
  fi

  approved=$(rpc_view "$MASTERS_ACCOUNT" nft_is_approved \
    "{\"token_id\":\"$token\",\"approved_account_id\":\"$MARKET_ACCOUNT\",\"approval_id\":null}")
  if [ "$approved" != "true" ]; then
    say "Approving $MARKET_ACCOUNT for $token as $artist"
    run_tx "approve-$token" near contract call-function as-transaction "$MASTERS_ACCOUNT" nft_approve \
      json-args "{\"token_id\":\"$token\",\"account_id\":\"$MARKET_ACCOUNT\",\"msg\":null}" \
      prepaid-gas 30Tgas \
      attached-deposit "$APPROVAL_DEPOSIT" \
      sign-as "$artist" \
      network-config "$NETWORK" \
      "$SIGN_WITH" send || die "approval transaction for $token failed; see the output above"
  else
    say "$token is already approved for $MARKET_ACCOUNT"
  fi

  listing=$(rpc_view "$MARKET_ACCOUNT" get_listing "{\"token_id\":\"$token\"}")
  if [ "$listing" != "null" ]; then
    state=$(listing_state "$listing")
    IFS=$'\t' read -r active seller listing_price <<<"$state"
    if [ "$active" = "true" ]; then
      if [ "$seller" = "$artist" ] && [ "$listing_price" = "$price" ]; then
        say "$token already listed by $artist at $price micro-USDC (skipping)"
        return 0
      fi
      warn "$token has an active listing by $seller at $listing_price; expected $artist at $price. Leaving it alone."
      return 0
    fi
    say "$token has an inactive old listing; re-listing replaces it"
  fi

  say "Listing $token at $price micro-USDC (deposit $LISTING_DEPOSIT)"
  run_tx "list-$token" near contract call-function as-transaction "$MARKET_ACCOUNT" list \
    json-args "{\"token_id\":\"$token\",\"price\":\"$price\"}" \
    prepaid-gas 50Tgas \
    attached-deposit "$LISTING_DEPOSIT" \
    sign-as "$artist" \
    network-config "$NETWORK" \
    "$SIGN_WITH" send || die "list transaction for $token failed; see the output above"

  wait_for_listing "$token" "$artist" "$price" ||
    die "listing for $token did not become active; inspect the transaction above"
}

list_masters() {
  local token price artist
  while IFS=$'\t' read -r token price artist; do
    [ -n "$token" ] || continue
    ensure_listing "$token" "$price" "$artist"
  done < <(catalogue_listings)
}

buy_pass() {
  local active expiry balance
  active=$(rpc_view "$PLATFORM_ACCOUNT" is_pass_active "{\"account_id\":\"$LISTENER_ACCOUNT\"}")
  if [ "$active" = "true" ]; then
    expiry=$(rpc_view "$PLATFORM_ACCOUNT" pass_expiry "{\"account_id\":\"$LISTENER_ACCOUNT\"}" | tr -d '"')
    say "Pass already active for $LISTENER_ACCOUNT (expires $expiry; skipping)"
    return 0
  fi

  balance=$(rpc_view "$USDC_ACCOUNT" ft_balance_of "{\"account_id\":\"$LISTENER_ACCOUNT\"}" | tr -d '"')
  [ "${balance:-0}" -ge "$PASS_PRICE" ] ||
    die "$LISTENER_ACCOUNT has $balance micro-USDC, needs $PASS_PRICE for the pass"

  say "Buying the pass for $LISTENER_ACCOUNT ($PASS_PRICE micro-USDC)"
  run_tx pass near contract call-function as-transaction "$USDC_ACCOUNT" ft_transfer_call \
    json-args "{\"receiver_id\":\"$PLATFORM_ACCOUNT\",\"amount\":\"$PASS_PRICE\",\"memo\":null,\"msg\":\"pass\"}" \
    prepaid-gas 100Tgas \
    attached-deposit 1yoctoNEAR \
    sign-as "$LISTENER_ACCOUNT" \
    network-config "$NETWORK" \
    "$SIGN_WITH" send || die "pass transaction failed; see the output above"

  wait_for_pass || die "pass did not become active for $LISTENER_ACCOUNT"
}

command -v near >/dev/null || die "near-cli-rs ('near') is required"
command -v python3 >/dev/null || die "python3 is required"
command -v curl >/dev/null || die "curl is required"
[ -f "$CATALOGUE" ] || die "missing catalogue: $CATALOGUE"

printf 'Sonata demo mint\nnetwork: %s\nrpc:     %s\n' "$NETWORK" "$RPC_URL"
require_deployed
mint_songs
list_masters
buy_pass

say "Done"
cat <<EOF
masters:  12 tokens in $MASTERS_ACCOUNT (owners: $NADIA_ACCOUNT, $KOFI_ACCOUNT, $LENA_ACCOUNT)
listings: 5 active in $MARKET_ACCOUNT
pass:     $LISTENER_ACCOUNT -> $PLATFORM_ACCOUNT ($PASS_PRICE micro-USDC)
verify:   scripts/check-demo.sh
EOF
