#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: validate-openapi.sh <spec-file-or-url> [bundle-output]

Validates an OpenAPI description with Redocly CLI. If bundle-output or
OPENAPI_BUNDLE_OUT is provided, also writes a bundled single-file spec.

Environment:
  OPENAPI_BUNDLE_OUT       Optional output path for bundled spec
  OPENAPI_REDOCLY_CONFIG   Optional redocly.yaml path
  HTTP_PROXY/HTTPS_PROXY   Proxy settings respected by Redocly CLI
  NO_PROXY                 Hosts that bypass proxy
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 1 ]]; then
  usage
  exit $([[ $# -lt 1 ]] && echo 2 || echo 0)
fi

SPEC="$1"
BUNDLE_OUT="${2:-${OPENAPI_BUNDLE_OUT:-}}"

if [[ "$SPEC" != http://* && "$SPEC" != https://* && ! -f "$SPEC" ]]; then
  echo "Spec not found: $SPEC" >&2
  exit 66
fi

if command -v redocly >/dev/null 2>&1; then
  REDOCLY=(redocly)
else
  REDOCLY=(npx --yes @redocly/cli@latest)
fi

CONFIG_ARGS=()
if [[ -n "${OPENAPI_REDOCLY_CONFIG:-}" ]]; then
  CONFIG_ARGS+=(--config "$OPENAPI_REDOCLY_CONFIG")
fi

echo "Linting $SPEC"
"${REDOCLY[@]}" lint "$SPEC" "${CONFIG_ARGS[@]}"

if [[ -n "$BUNDLE_OUT" ]]; then
  mkdir -p "$(dirname "$BUNDLE_OUT")"
  echo "Bundling $SPEC -> $BUNDLE_OUT"
  "${REDOCLY[@]}" bundle "$SPEC" --output "$BUNDLE_OUT" "${CONFIG_ARGS[@]}"
fi
