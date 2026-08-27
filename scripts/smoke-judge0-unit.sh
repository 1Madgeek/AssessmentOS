#!/usr/bin/env bash
# Smoke-check that Judge0 unit tooling is present in the running container.
# Requires: docker compose overlay already up (service name: judge0).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.judge0-unit.yml)
SERVICE="${JUDGE0_SERVICE:-judge0}"

echo "==> Checking tools inside ${SERVICE}…"
"${COMPOSE[@]}" exec -T "$SERVICE" bash -lc '
set -e
python3 -m pytest --version
jest --version
phpunit --version
test -f /opt/junit/junit-platform-console-standalone.jar
g++ --version
echo "tools_ok"
'

echo "==> Submitting a minimal pytest multi-file job to Judge0 API…"
# Build a tiny zip: solution.py + test_solution.py + run script (language 89)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat >"$TMP/solution.py" <<'PY'
def add(a, b):
    return a + b
PY
cat >"$TMP/test_solution.py" <<'PY'
from solution import add

def test_add():
    assert add(1, 2) == 3
PY
cat >"$TMP/run" <<'SH'
#!/bin/bash
set +e
python3 -m pytest -q --tb=short
exit $?
SH
chmod +x "$TMP/run"
(
  cd "$TMP"
  zip -q -r workspace.zip solution.py test_solution.py run
)

B64="$(base64 <"$TMP/workspace.zip" | tr -d '\n')"
JUDGE0_URL="${JUDGE0_URL:-http://localhost:2358}"

RESP="$(curl -sS -X POST "${JUDGE0_URL}/submissions?base64_encoded=false&wait=true" \
  -H "Content-Type: application/json" \
  -d "{\"language_id\":89,\"additional_files\":\"${B64}\"}")"

echo "$RESP" | head -c 2000
echo
STATUS="$(echo "$RESP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("status") or {}).get("description") or d.get("status_id"))' 2>/dev/null || true)"
STDOUT="$(echo "$RESP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("stdout") or "")' 2>/dev/null || true)"

if echo "$STDOUT" | grep -qE 'passed|1 passed'; then
  echo "SMOKE_OK pytest via Judge0"
  exit 0
fi
if [ "$STATUS" = "Accepted" ]; then
  echo "SMOKE_OK status Accepted"
  exit 0
fi

echo "SMOKE_FAIL unexpected response (status=${STATUS})" >&2
exit 1
