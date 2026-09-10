#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: mock-openapi.sh <spec-file-or-url> [port] [extra prism args...]

Runs a Prism mock server from an OpenAPI description.

Environment:
  OPENAPI_MOCK_HOST  Host to bind, default 0.0.0.0
  OPENAPI_MOCK_PORT  Port to bind when the second argument is omitted, default 4010
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 1 ]]; then
  usage
  exit $([[ $# -lt 1 ]] && echo 2 || echo 0)
fi

SPEC="$1"
PORT="${2:-${OPENAPI_MOCK_PORT:-4010}}"
HOST="${OPENAPI_MOCK_HOST:-0.0.0.0}"
shift || true
[[ $# -gt 0 ]] && shift || true

if [[ "$SPEC" != http://* && "$SPEC" != https://* && ! -f "$SPEC" ]]; then
  echo "Spec not found: $SPEC" >&2
  exit 66
fi

if command -v prism >/dev/null 2>&1; then
  PRISM=(prism)
else
  PRISM=(npx --yes @stoplight/prism-cli)
fi

echo "Starting Prism mock for $SPEC at http://$HOST:$PORT"
exec "${PRISM[@]}" mock "$SPEC" --host "$HOST" --port "$PORT" "$@"
