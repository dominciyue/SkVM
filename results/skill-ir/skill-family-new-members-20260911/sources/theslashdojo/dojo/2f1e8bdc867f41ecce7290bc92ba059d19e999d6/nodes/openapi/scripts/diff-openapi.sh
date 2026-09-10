#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: diff-openapi.sh <base-spec> <revision-spec> [extra oasdiff args...]

Detects breaking OpenAPI changes with oasdiff.

Environment:
  OPENAPI_DIFF_MODE    breaking or changelog, default breaking
  OPENAPI_DIFF_FORMAT  text, yaml, json, or junit when supported, default text
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 2 ]]; then
  usage
  exit 2
fi

BASE="$1"
REVISION="$2"
MODE="${OPENAPI_DIFF_MODE:-breaking}"
FORMAT="${OPENAPI_DIFF_FORMAT:-text}"
shift 2

for spec in "$BASE" "$REVISION"; do
  if [[ "$spec" != http://* && "$spec" != https://* && ! -f "$spec" ]]; then
    echo "Spec not found: $spec" >&2
    exit 66
  fi
done

if ! command -v oasdiff >/dev/null 2>&1; then
  echo "oasdiff is not installed." >&2
  echo "Install with: brew install oasdiff" >&2
  echo "Then rerun: oasdiff $MODE $BASE $REVISION --format $FORMAT" >&2
  exit 69
fi

echo "Running oasdiff $MODE between $BASE and $REVISION"
exec oasdiff "$MODE" "$BASE" "$REVISION" --format "$FORMAT" "$@"
