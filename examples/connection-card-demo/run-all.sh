#!/usr/bin/env bash
# Start the demo server + vendo dev front-door together.
# Usage:
#   examples/connection-card-demo/run-all.sh [vendo-dev-port]
#
# Defaults to vendo dev on :8789 (because :8787 is often taken by hermes-dev).
# The internal demo server runs on $DEMO_PORT (default 3210) and is hidden
# behind the proxy.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEMO_PORT="${DEMO_PORT:-3210}"
PROXY_PORT="${1:-${VENDO_DEV_PORT:-8789}}"

# Locate the vendo CLI. Honor $VENDO_BIN, else assume the standard checkout.
VENDO_BIN="${VENDO_BIN:-$HOME/Desktop/Cool Code/vendo/bin/vendo}"
if [[ ! -x "$VENDO_BIN" ]]; then
  echo "ERROR: vendo CLI not found at $VENDO_BIN — set VENDO_BIN=/path/to/bin/vendo" >&2
  exit 1
fi

# Sanity: SDK build must exist. Otherwise the browser will 404 on /dist/*.
if [[ ! -f "$SDK_ROOT/dist/browser/index.js" ]]; then
  echo "ERROR: $SDK_ROOT/dist/browser/index.js not found." >&2
  echo "       Run \`npm run build -- --watch\` in another terminal first." >&2
  exit 1
fi

PIDS=()
cleanup() {
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

prefix() { sed -u "s/^/[$1] /"; }

(PORT="$DEMO_PORT" node "$SCRIPT_DIR/server.mjs") 2>&1 | prefix demo &
PIDS+=($!)

# Give the demo server a beat to bind before vendo dev starts proxying.
sleep 1

("$VENDO_BIN" dev --port "$PROXY_PORT" --origin "http://127.0.0.1:$DEMO_PORT") 2>&1 | prefix proxy &
PIDS+=($!)

echo
echo "[run-all] up — open http://127.0.0.1:$PROXY_PORT"
echo

wait -n
