# Optimized skill usage

Delivery: `draft`; bounded behavior: `not-run`.

## Use this package

Use the package as an ordinary skill:

`skvm run --prompt "<task>" --skill <package-path> --workdir "<project-dir>" --model "<provider/model>"`

The original task result remains in its original work directory. This package is a separate development candidate.

## Optimized steps

- `contract-first-i18n-workflow` (restructure-docs, selected)
  - inputs/parameter sources: project source files; optional user-supplied localization contract, manifest, or schema
  - outputs: contract-compliant source and locale changes; contract output or the skill's default report when no exact format is supplied
  - preconditions: the agent can read the project and any supplied contract; required edits are permitted by the current task

## Remaining agent work

- interpret framework-specific source syntax
- produce semantically accurate translations
- run only locally available checks and report verification gaps

## Failure and fallback

If an optimized step is not applicable or fails, keep the original task result and continue with the package's SKILL.md agent workflow; do not count the fallback as automated success.

Exit code 2 means the helper is not applicable to that input. Exit code 1 means a required input, dependency, binding, or program condition failed and should be fixed before retrying the helper.
