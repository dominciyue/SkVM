# Optimized skill usage

Delivery: `draft`; bounded behavior: `not-run`.

## Use this package

Use the package as an ordinary skill:

`skvm run --prompt "<task>" --skill <package-path> --workdir "<project-dir>" --model "<provider/model>"`

The original task result remains in its original work directory. This package is a separate development candidate.

## Optimized steps

Resolve executable paths relative to the directory containing SKILL.md; pass task input/output paths from the project directory or as absolute paths.

- `portable-contract-finalizer-route` (reuse-script, selected): `node scripts/i18n-contract-tool.mjs`
  - inputs/parameter sources: --contract path supplied by the current project; --root project directory supplied by the current project
  - fill command placeholders from: --contract path supplied by the current project; --root project directory supplied by the current project; contract.report.path JSON report; concise JSON completion summary on stdout; skill: The helper is bounded to the public React react-i18next v2 contract.; task: Contract-declared allowed, required, and protected paths come from the current project contract.
  - outputs: contract.report.path JSON report; concise JSON completion summary on stdout
  - preconditions: Node.js is available; the contract is skill-ir-i18n-helper-public-contract/v2 with framework react-i18next; source and locale files have been reviewed and created

## Remaining agent work

- choose applicability
- review semantic translation and framework wiring
- preserve protected files
- continue fallback workflow after exit 2 or unsupported input

## Failure and fallback

If an optimized step is not applicable or fails, keep the original task result and continue with the package's SKILL.md agent workflow; do not count the fallback as automated success.

Use each program's documented exit codes and diagnostics; this package does not impose a shared exit-code convention. Manifests and validation reports are for diagnosis, not routine prerequisites.

