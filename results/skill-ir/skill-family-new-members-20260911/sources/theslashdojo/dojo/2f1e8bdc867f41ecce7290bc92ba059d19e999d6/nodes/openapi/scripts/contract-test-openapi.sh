#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: contract-test-openapi.sh <spec-file-or-url> <base-url> [extra schemathesis args...]

Runs Schemathesis property-based API tests against a live service.

Environment:
  OPENAPI_TEST_URL         Base URL when second argument is omitted
  SCHEMATHESIS_REPORT      Optional report path, passed as --report
  API_TOKEN                Optional bearer token, sent as Authorization header
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 1 ]]; then
  usage
  exit $([[ $# -lt 1 ]] && echo 2 || echo 0)
fi

SPEC="$1"
BASE_URL="${2:-${OPENAPI_TEST_URL:-}}"
shift || true
[[ $# -gt 0 ]] && shift || true

if [[ -z "$BASE_URL" ]]; then
  echo "Missing base URL. Pass it as the second argument or set OPENAPI_TEST_URL." >&2
  exit 2
fi

if [[ "$SPEC" != http://* && "$SPEC" != https://* && ! -f "$SPEC" ]]; then
  echo "Spec not found: $SPEC" >&2
  exit 66
fi

if command -v schemathesis >/dev/null 2>&1; then
  SCHEMATHESIS=(schemathesis)
elif command -v st >/dev/null 2>&1; then
  SCHEMATHESIS=(st)
elif command -v uvx >/dev/null 2>&1; then
  SCHEMATHESIS=(uvx schemathesis)
else
  echo "Schemathesis is not installed and uvx is unavailable." >&2
  echo "Install with: pipx install schemathesis  or  pip install schemathesis" >&2
  exit 69
fi

ARGS=(run "$SPEC" --url "$BASE_URL")

if [[ -n "${API_TOKEN:-}" ]]; then
  ARGS+=(--header "Authorization: Bearer ${API_TOKEN}")
fi

if [[ -n "${SCHEMATHESIS_REPORT:-}" ]]; then
  ARGS+=(--report "$SCHEMATHESIS_REPORT")
fi

echo "Testing $BASE_URL against $SPEC"
exec "${SCHEMATHESIS[@]}" "${ARGS[@]}" "$@"
