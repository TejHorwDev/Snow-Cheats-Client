#!/usr/bin/env bash
#
# The licence chain, end to end, against a running server.
#
#   1. node scripts/dev-supabase.mjs            (the stand-in, port 54321)
#   2. SUPABASE_URL=http://127.0.0.1:54321 PORT=5281 npm run start
#   3. bash scripts/licence-e2e.sh [API]        (default http://127.0.0.1:5281)
#
# It creates a product, an account with that product attached (mint + redeem in one
# action), signs in from one device, then proves a second device is refused and
# that a product the account does not own is denied.
set -u
API=${1:-http://127.0.0.1:5281}
J=/tmp/jar.txt; rm -f $J
say() { printf '%s\n' "$*"; }

say "1. panel sign-in"
curl -s -c $J -X POST "$API/api/admin/login" -H 'content-type: application/json' \
  -d '{"username":"localadmin","password":"local-only-test-password"}' | head -c 120; echo

say "2. create account with the product attached (one action)"
MADE=$(curl -s -b $J -X POST "$API/api/admin/accounts" -H 'content-type: application/json' \
  -d '{"username":"e2e-rider","password":"e2e-password-123","note":"e2e","productId":"ebb6678e-ed0f-4f6b-a20a-7463906cad64","days":7,"deviceLimit":1}')
echo "$MADE"
KEY=$(printf '%s' "$MADE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('licence',{}).get('code',''))")
say "   licence key: $KEY"

say "3. loader signs in from device A"
A=$(printf 'a%.0s' $(seq 1 64))
LOGIN=$(curl -s -X POST "$API/v1/login" -H 'content-type: application/json' \
  -d "{\"username\":\"e2e-rider\",\"password\":\"e2e-password-123\",\"app_id\":\"7cceaf553a603ceb8d54a6c2\",\"device_id\":\"$A\",\"device_name\":\"Test PC\"}")
echo "$LOGIN" | head -c 200; echo
TOKEN=$(printf '%s' "$LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")

say "4. what that account owns"
curl -s "$API/v1/apps" -H "Authorization: Bearer $TOKEN"; echo

say "5. the same account from a second device (limit is 1) — must be refused"
B=$(printf 'b%.0s' $(seq 1 64))
curl -s -o /tmp/b.json -w '   HTTP %{http_code}\n' -X POST "$API/v1/login" -H 'content-type: application/json' \
  -d "{\"username\":\"e2e-rider\",\"password\":\"e2e-password-123\",\"app_id\":\"7cceaf553a603ceb8d54a6c2\",\"device_id\":\"$B\",\"device_name\":\"Second PC\"}"
cat /tmp/b.json; echo

say "6. /v1/check for a product this account does NOT own"
C=$(printf 'c%.0s' $(seq 1 64))
curl -s -X POST "$API/v1/check" -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"app_id":"someone-elses-app"}'; echo

say "7. /v1/check for the product it does own"
curl -s -X POST "$API/v1/check" -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"app_id":"e2etestapp001"}'; echo
