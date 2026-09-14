# Optimized skill usage

Delivery: `draft`; bounded behavior: `not-run`.

## Use this package

Use the package as an ordinary skill:

`skvm run --prompt "<task>" --skill <package-path> --workdir "<project-dir>" --model "<provider/model>"`

The original task result remains in its original work directory. This package is a separate development candidate.

## Optimized steps

- `generate-react-v2-contract-finalizer` (generate-script, selected): `node scripts/i18n-contract-tool.mjs <arg-1> --contract <contract> --root <root>`
  - inputs/parameter sources: --contract path to a skill-ir-i18n-helper-public-contract/v2 JSON file; --root project directory containing the contract-declared transformed sources, config, and locale JSON files
  - fill command placeholders from: --contract path to a skill-ir-i18n-helper-public-contract/v2 JSON file; --root project directory containing the contract-declared transformed sources, config, and locale JSON files; the JSON file at contract.report.path; a concise JSON completion summary on stdout; skill: Preserve placeholders and use locale-aware handling for plural, gender, date, number, and currency semantics.; task: Allowed, required, protected paths and the exact report ABI are supplied by the current project contract rather than promoted to skill-wide constants.
  - outputs: the JSON file at contract.report.path; a concise JSON completion summary on stdout
  - preconditions: Node.js is available; contract.framework is react-i18next; the agent has already completed and reviewed source, config, and locale files
- `route-supported-contract-workflow` (restructure-docs, selected)
  - inputs/parameter sources: project localization request and any project-supplied contract
  - outputs: contract-first workflow and copy-ready finalizer command
  - preconditions: inspect the project before selecting the bounded command

## Remaining agent work

- confirm translation meaning and interpolation conversion
- verify framework initialization and runtime behavior
- compare protected-file bytes or version-control diff
- use the original workflow for unsupported contracts and frameworks

## Failure and fallback

If an optimized step is not applicable or fails, keep the original task result and continue with the package's SKILL.md agent workflow; do not count the fallback as automated success.

Exit code 2 means the helper is not applicable to that input. Exit code 1 means a required input, dependency, binding, or program condition failed and should be fixed before retrying the helper.

