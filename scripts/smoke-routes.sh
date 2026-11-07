#!/usr/bin/env sh
# Route and public-read smoke test for a running Sonata web server.
#
# Usage:
#   scripts/smoke-routes.sh [base-url]
#
# Default base URL: http://127.0.0.1:3001. The script starts nothing itself:
# point it at a server that is already running.
#
#   cd apps/web && bun --env-file=../../.env --env-file=../../.env.local \
#     next dev -p 3001
#   scripts/smoke-routes.sh http://127.0.0.1:3001
#
# Checks:
#   * every Sonata route answers 200 (the streamed body is drained fully) and
#     does not contain the RSC "Functions cannot be passed directly to Client
#     Components" serialization error;
#   * the public tRPC reads answer with the superjson GET envelope
#     `{"result":{"data":{"json":...}}}` and the expected shape.
#
# Exit code: 0 when every check passes, 1 as soon as one fails.
# Requires: curl, python3.

set -eu

BASE="${1:-http://127.0.0.1:3001}"
BASE="${BASE%/}"
TIMEOUT=120

TMPDIR_SMOKE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_SMOKE"' EXIT INT TERM

PASS=0
FAIL=0

pass() {
  PASS=$((PASS + 1))
  printf 'PASS  %s\n' "$1"
}

fail() {
  FAIL=$((FAIL + 1))
  printf 'FAIL  %s\n' "$1"
}

# Fails when a dev error page serialized a server function into a client prop.
check_rsc_error() {
  body="$1"
  if grep -q "Functions cannot be passed directly to Client Components" "$body"; then
    fail "$2 (RSC render-prop serialization error)"
    return 1
  fi
  return 0
}

check_route() {
  route="$1"
  body="$TMPDIR_SMOKE/route.html"
  code="$(curl -sS --max-time "$TIMEOUT" -o "$body" -w '%{http_code}' "$BASE$route")" ||
    code="000"

  if [ "$code" != "200" ]; then
    fail "GET $route -> $code"
    grep -o -m1 '<title>[^<]*' "$body" 2>/dev/null | sed 's/^/      /' || true
    return 0
  fi

  if [ ! -s "$body" ]; then
    fail "GET $route -> 200 with an empty body"
    return 0
  fi

  if check_rsc_error "$body" "GET $route"; then
    pass "GET $route -> 200"
  fi
}

# Writes the superjson payload validator once; each call passes the shape kind.
write_validator() {
  cat >"$TMPDIR_SMOKE/check.py" <<'PY'
import json
import sys

kind = sys.argv[1]
raw = sys.stdin.read()

try:
    payload = json.loads(raw)
except json.JSONDecodeError:
    print("body is not JSON: %s" % raw[:160].replace("\n", " "))
    sys.exit(1)

if "error" in payload:
    print("trpc error: %s" % json.dumps(payload["error"])[:200])
    sys.exit(1)

try:
    data = payload["result"]["data"]["json"]
except (KeyError, TypeError):
    print("missing superjson envelope: %s" % raw[:160].replace("\n", " "))
    sys.exit(1)

if kind == "stats":
    required = ("totalPaidUsdc", "activeListings", "songsCount")
    if not isinstance(data, dict) or any(key not in data for key in required):
        print("unexpected stats shape: %s" % json.dumps(data)[:200])
        sys.exit(1)
    print(
        "stats totalPaidUsdc=%s activeListings=%s songsCount=%s"
        % (data["totalPaidUsdc"], data["activeListings"], data["songsCount"])
    )
elif kind == "songs":
    if not isinstance(data, list) or len(data) != 3:
        print("expected 3 songs, got: %s" % json.dumps(data)[:200])
        sys.exit(1)
    titles = ", ".join(str(song.get("title")) for song in data)
    print("songs limit=3 got=3 [%s]" % titles)
elif kind == "listings":
    if not isinstance(data, list) or not data:
        print("expected active listings, got: %s" % json.dumps(data)[:200])
        sys.exit(1)
    print("listings sort=recent got=%d" % len(data))
elif kind == "pass":
    if not isinstance(data, dict) or data.get("accountId") != "listener.sonata.testnet":
        print("expected the listener pass, got: %s" % json.dumps(data)[:200])
        sys.exit(1)
    print(
        "pass accountId=%s expiresAt=%s"
        % (data.get("accountId"), data.get("expiresAt"))
    )
else:
    print("unknown validator kind: %s" % kind)
    sys.exit(1)
PY
}

check_trpc() {
  label="$1"
  path="$2"
  input="$3"
  kind="$4"
  body="$TMPDIR_SMOKE/trpc.json"

  if ! curl -sS --globoff --get --max-time "$TIMEOUT" \
    --data-urlencode "input=$input" \
    -o "$body" -w '%{http_code}' "$BASE$path" >"$TMPDIR_SMOKE/status"; then
    fail "tRPC $label (request failed)"
    return 0
  fi

  code="$(cat "$TMPDIR_SMOKE/status")"
  if [ "$code" != "200" ]; then
    fail "tRPC $label -> $code"
    return 0
  fi

  if result="$(python3 "$TMPDIR_SMOKE/check.py" "$kind" <"$body")"; then
    pass "tRPC $label -> 200 ($result)"
  else
    fail "tRPC $label ($result)"
  fi
}

write_validator

printf 'Sonata route smoke: %s\n\n' "$BASE"

for route in \
  / \
  /market \
  /master/midnight-drive \
  /pass \
  /audit \
  /library \
  /artist/dashboard \
  /search
do
  check_route "$route"
done

printf '\n'

check_trpc "sonata.stats.overview" "/api/trpc/sonata.stats.overview" '{}' stats
check_trpc "sonata.songs.list" "/api/trpc/sonata.songs.list" \
  '{"json":{"limit":3}}' songs
check_trpc "sonata.market.listings" "/api/trpc/sonata.market.listings" \
  '{"json":{"sort":"recent"}}' listings
check_trpc "sonata.pass.byAccount" "/api/trpc/sonata.pass.byAccount" \
  '{"json":{"accountId":"listener.sonata.testnet"}}' pass

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"

[ "$FAIL" -eq 0 ]
