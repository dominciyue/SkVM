#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: generate-openapi.sh <spec-file-or-url> [generator] [output-dir] [extra generator args...]

Examples:
  generate-openapi.sh openapi.yaml typescript-fetch generated/client
  OPENAPI_GENERATOR_ADDITIONAL_PROPERTIES=npmName=@acme/api,supportsES6=true generate-openapi.sh openapi.yaml typescript-fetch generated/client

Environment:
  OPENAPI_GENERATOR_ADDITIONAL_PROPERTIES  Passed as --additional-properties
  OPENAPI_GENERATOR_GLOBAL_PROPERTIES      Passed as --global-property
  OPENAPI_GENERATOR_VERSION                Version selected by the npm wrapper, when supported
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 1 ]]; then
  usage
  exit $([[ $# -lt 1 ]] && echo 2 || echo 0)
fi

SPEC="$1"
GENERATOR="${2:-typescript-fetch}"
OUT="${3:-generated/${GENERATOR}}"
shift || true
[[ $# -gt 0 ]] && shift || true
[[ $# -gt 0 ]] && shift || true

if [[ "$SPEC" != http://* && "$SPEC" != https://* && ! -f "$SPEC" ]]; then
  echo "Spec not found: $SPEC" >&2
  exit 66
fi

if command -v openapi-generator-cli >/dev/null 2>&1; then
  GENERATOR_CMD=(openapi-generator-cli)
else
  GENERATOR_CMD=(npx --yes @openapitools/openapi-generator-cli)
fi

ARGS=(generate -i "$SPEC" -g "$GENERATOR" -o "$OUT")

if [[ -n "${OPENAPI_GENERATOR_ADDITIONAL_PROPERTIES:-}" ]]; then
  ARGS+=(--additional-properties "$OPENAPI_GENERATOR_ADDITIONAL_PROPERTIES")
fi

if [[ -n "${OPENAPI_GENERATOR_GLOBAL_PROPERTIES:-}" ]]; then
  ARGS+=(--global-property "$OPENAPI_GENERATOR_GLOBAL_PROPERTIES")
fi

echo "Generating $GENERATOR from $SPEC into $OUT"
exec "${GENERATOR_CMD[@]}" "${ARGS[@]}" "$@"
